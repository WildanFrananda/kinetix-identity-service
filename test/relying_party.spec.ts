import { relyingPartyFrom } from "../src/infrastructure/config/relying_party"
import { passkeyCeremonyFrom } from "../src/infrastructure/webauthn/passkey_ceremony.provider"
import type { RelyingParty } from "../src/types/relying_party.type"

const ONION_HOST = "kinetixbackofficeexampleonionaddressabcdefghijklmnopqrstu.onion"

const LAB: Readonly<Record<string, string>> = {
  IDENTITY_WEBAUTHN_RP_ID: "backoffice.localhost",
  IDENTITY_WEBAUTHN_ORIGIN: "https://backoffice.localhost:8443",
  IDENTITY_WEBAUTHN_RP_NAME: "Kinetix Backoffice"
}

function configWith(settings: Record<string, string | undefined>): any {
  return { get: (name: string) => settings[name] }
}

function relyingPartyOf(settings: Readonly<Record<string, string | undefined>>): RelyingParty {
  return relyingPartyFrom(function (name: string): string | undefined {
    return settings[name]
  })
}

describe("the passkeys' relying party, read at start", () => {
  it("reads the lab's settings", () => {
    expect(relyingPartyOf(LAB)).toEqual({
      id: "backoffice.localhost",
      origin: "https://backoffice.localhost:8443",
      name: "Kinetix Backoffice"
    })
  })

  it("reads production's: the onion host, over plain http as Tor Browser serves it", () => {
    const relyingParty = relyingPartyOf({
      ...LAB,
      IDENTITY_WEBAUTHN_RP_ID: ONION_HOST,
      IDENTITY_WEBAUTHN_ORIGIN: `http://${ONION_HOST}`
    })

    expect(relyingParty.id).toBe(ONION_HOST)
    expect(relyingParty.origin).toBe(`http://${ONION_HOST}`)
  })

  it("accepts an origin on a host under the relying party", () => {
    const relyingParty = relyingPartyOf({ ...LAB, IDENTITY_WEBAUTHN_ORIGIN: "https://staff.backoffice.localhost" })

    expect(relyingParty.origin).toBe("https://staff.backoffice.localhost")
  })

  it.each(["IDENTITY_WEBAUTHN_RP_ID", "IDENTITY_WEBAUTHN_ORIGIN", "IDENTITY_WEBAUTHN_RP_NAME"])(
    "refuses to start without %s",
    (name) => {
      expect(() => relyingPartyOf({ ...LAB, [name]: undefined })).toThrow(`${name} is required`)
      expect(() => relyingPartyOf({ ...LAB, [name]: "  " })).toThrow(`${name} is required`)
    }
  )

  it.each(["10.8.0.1", "::1", "Backoffice.Localhost", "backoffice_localhost", "-backoffice.localhost"])(
    "refuses the relying party %p, which is not a lower-case domain name",
    (id) => {
      expect(() => relyingPartyOf({ ...LAB, IDENTITY_WEBAUTHN_RP_ID: id })).toThrow(/IDENTITY_WEBAUTHN_RP_ID is/)
    }
  )

  it.each([
    "https://backoffice.example",
    "https://notbackoffice.localhost:8443",
    "https://localhost:8443"
  ])("refuses the origin %p, whose host is not the relying party's", (origin) => {
    expect(() => relyingPartyOf({ ...LAB, IDENTITY_WEBAUTHN_ORIGIN: origin })).toThrow(/neither IDENTITY_WEBAUTHN_RP_ID/)
  })

  it.each([
    "backoffice.localhost:8443",
    "https://backoffice.localhost:8443/",
    "https://backoffice.localhost:8443/login",
    "ftp://backoffice.localhost",
    "https://BACKOFFICE.localhost:8443"
  ])("refuses the origin %p, which is not one lower-case http(s) origin", (origin) => {
    expect(() => relyingPartyOf({ ...LAB, IDENTITY_WEBAUTHN_ORIGIN: origin })).toThrow(/IDENTITY_WEBAUTHN_ORIGIN is/)
  })

  it("is what the ceremony provider reads, so a missing setting stops the service", () => {
    expect(() => passkeyCeremonyFrom(configWith(LAB))).not.toThrow()
    expect(() => passkeyCeremonyFrom(configWith({ ...LAB, IDENTITY_WEBAUTHN_ORIGIN: undefined }))).toThrow(
      "IDENTITY_WEBAUTHN_ORIGIN is required"
    )
  })
})
