import { ConfigService } from "@nestjs/config"
import ClientGateService from "../src/application/services/client_gate.service"
import { clientGateFrom } from "../src/infrastructure/attestation/client_gate.provider"
import { appIdSettingOf, clientRegistryFrom } from "../src/infrastructure/config/client_registry"
import type { ClientRegistry } from "../src/types/client.type"

const PROJECT_NUMBER = "123456789012"

const ANDROID = `1:${PROJECT_NUMBER}:android:0a1b2c3d4e5f6a7b`

const IOS = `1:${PROJECT_NUMBER}:ios:7b6a5f4e3d2c1b0a`

const PRODUCTION: Readonly<Record<string, string>> = {
  IDENTITY_CLIENTS: "courier-app:app_check",
  IDENTITY_UNNAMED_CLIENTS: "allow",
  FIREBASE_PROJECT_NUMBER: PROJECT_NUMBER,
  IDENTITY_APP_CHECK_APP_IDS_COURIER_APP: `${ANDROID},${IOS}`
}

function registryOf(settings: Readonly<Record<string, string | undefined>>): ClientRegistry {
  return clientRegistryFrom(function (name: string): string | undefined {
    return settings[name]
  })
}

describe("the client registry, read at start", () => {
  it("reads the lab's settings: the courier app named, no proof, unnamed clients allowed", () => {
    const registry = registryOf({ IDENTITY_CLIENTS: "courier-app:none", IDENTITY_UNNAMED_CLIENTS: "allow" })

    expect([...registry.clients.values()]).toEqual([{ name: "courier-app", proof: "none" }])
    expect(registry.unnamed).toBe("allow")
    expect(registry.firebaseProjectNumber).toBeNull()
  })

  it("reads production's first settings: the courier app proves itself with App Check", () => {
    const registry = registryOf(PRODUCTION)

    expect(registry.clients.get("courier-app")).toEqual({
      name: "courier-app",
      proof: "app_check",
      appIds: new Set([ANDROID, IOS])
    })
    expect(registry.firebaseProjectNumber).toBe(PROJECT_NUMBER)
  })

  it("reads several clients and trims the spaces between them", () => {
    const registry = registryOf({
      ...PRODUCTION,
      IDENTITY_CLIENTS: " courier-app:app_check , seller-web:none,backoffice:none ",
      IDENTITY_UNNAMED_CLIENTS: "refuse"
    })

    expect([...registry.clients.keys()]).toEqual(["courier-app", "seller-web", "backoffice"])
    expect(registry.unnamed).toBe("refuse")
  })

  it("does not ask for Firebase settings when no client uses App Check", () => {
    expect(() => registryOf({ IDENTITY_CLIENTS: "seller-web:none", IDENTITY_UNNAMED_CLIENTS: "refuse" })).not.toThrow()
  })

  it("names the app id setting after the client, upper-cased with underscores", () => {
    expect(appIdSettingOf("courier-app")).toBe("IDENTITY_APP_CHECK_APP_IDS_COURIER_APP")
    expect(appIdSettingOf("buyer-app")).toBe("IDENTITY_APP_CHECK_APP_IDS_BUYER_APP")
  })

  describe("refuses to start", () => {
    it.each(["IDENTITY_CLIENTS", "IDENTITY_UNNAMED_CLIENTS"])("without %s", (name) => {
      expect(() => registryOf({ ...PRODUCTION, [name]: undefined })).toThrow(`${name} is required`)
    })

    it.each(["yes", "deny", "Allow", ""])("with the unnamed policy %j", (policy) => {
      expect(() => registryOf({ ...PRODUCTION, IDENTITY_UNNAMED_CLIENTS: policy })).toThrow(/IDENTITY_UNNAMED_CLIENTS/)
    })

    it.each(["play_integrity", "turnstile", "App_Check", "secret"])("with the unknown proof kind %s", (proof) => {
      expect(() => registryOf({ ...PRODUCTION, IDENTITY_CLIENTS: `courier-app:${proof}` })).toThrow(
        `IDENTITY_CLIENTS gives "courier-app" the proof "${proof}"; a proof is app_check or none.`
      )
    })

    it.each(["courier-app", "courier-app:none:extra", "courier-app:none,", ":none"])(
      "with the malformed entry list %j",
      (clients) => {
        expect(() => registryOf({ ...PRODUCTION, IDENTITY_CLIENTS: clients })).toThrow(/IDENTITY_CLIENTS/)
      }
    )

    it.each(["Courier-App", "courier_app", "courier--app", "unnamed", "unknown", "x".repeat(65)])(
      "with the client name %j",
      (name) => {
        expect(() => registryOf({ ...PRODUCTION, IDENTITY_CLIENTS: `${name}:none` })).toThrow(/names the client/)
      }
    )

    it("with a client named twice", () => {
      expect(() => registryOf({ ...PRODUCTION, IDENTITY_CLIENTS: "courier-app:none,courier-app:app_check" })).toThrow(
        'IDENTITY_CLIENTS names "courier-app" twice.'
      )
    })

    it("with App Check and no Firebase project number", () => {
      expect(() => registryOf({ ...PRODUCTION, FIREBASE_PROJECT_NUMBER: undefined })).toThrow(
        "FIREBASE_PROJECT_NUMBER is required"
      )
    })

    it("with the project's id where its number belongs", () => {
      expect(() => registryOf({ ...PRODUCTION, FIREBASE_PROJECT_NUMBER: "kinetix-prod" })).toThrow(/not its id/)
    })

    it("with App Check and no allowed app ids for the client", () => {
      expect(() => registryOf({ ...PRODUCTION, IDENTITY_APP_CHECK_APP_IDS_COURIER_APP: undefined })).toThrow(
        "IDENTITY_APP_CHECK_APP_IDS_COURIER_APP is required"
      )
    })

    it.each(["com.kinetix.courier", `${ANDROID},`, "1:123:android"])("with the app id list %j", (appIds) => {
      expect(() => registryOf({ ...PRODUCTION, IDENTITY_APP_CHECK_APP_IDS_COURIER_APP: appIds })).toThrow(
        /not a Firebase app id/
      )
    })

    it("with an app of another Firebase project", () => {
      const stranger = "1:999999999999:android:0a1b2c3d4e5f6a7b"

      expect(() => registryOf({ ...PRODUCTION, IDENTITY_APP_CHECK_APP_IDS_COURIER_APP: stranger })).toThrow(
        /another project/
      )
    })
  })

  describe("the gate built from the environment", () => {
    function configOf(settings: Readonly<Record<string, string>>): ConfigService {
      return {
        get: function (name: string): string | undefined {
          return settings[name]
        }
      } as unknown as ConfigService
    }

    it("is built without an App Check verifier for the lab", () => {
      const gate = clientGateFrom(configOf({ IDENTITY_CLIENTS: "courier-app:none", IDENTITY_UNNAMED_CLIENTS: "allow" }))

      expect(gate).toBeInstanceOf(ClientGateService)
    })

    it("is built with one for production, without fetching any key at start", () => {
      const fetching = jest.spyOn(globalThis, "fetch")

      const gate = clientGateFrom(configOf(PRODUCTION))

      expect(gate).toBeInstanceOf(ClientGateService)
      expect(fetching).not.toHaveBeenCalled()
      fetching.mockRestore()
    })

    it("refuses to be built for App Check without a verifier", () => {
      expect(() => new ClientGateService(registryOf(PRODUCTION), null)).toThrow(/no App Check verifier/)
    })
  })
})
