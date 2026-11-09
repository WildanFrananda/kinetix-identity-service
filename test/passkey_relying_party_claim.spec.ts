import { Logger } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { Test } from "@nestjs/testing"
import AuthUsecaseService from "../src/application/services/auth_usecase.service"
import ClientGateService from "../src/application/services/client_gate.service"
import PasskeyRelyingPartyClaimService from "../src/application/services/passkey_relying_party_claim.service"
import PasskeyUsecaseService from "../src/application/services/passkey_usecase.service"
import PrincipalResolverService from "../src/application/services/principal_resolver.service"
import SignInAttemptsService from "../src/application/services/sign_in_attempts.service"
import TokenService from "../src/application/services/token.service"
import RelyingParties from "../src/domain/relying_parties"
import { PASSKEY_CEREMONY_PROVIDER } from "../src/infrastructure/webauthn/passkey_ceremony.provider"
import { RELYING_PARTIES_PROVIDER } from "../src/infrastructure/webauthn/relying_parties.provider"
import { labRelyingParties, LAB_RELYING_PARTY, ONION_RELYING_PARTY } from "./support/lab_relying_party"

type LoggedEvent = { message: string; fields?: Record<string, unknown> }

describe("claiming the passkeys made before relying parties were recorded", () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it("gives them the first origin's relying party when identity starts, and says how many", async () => {
    const passkeys = { claimUnrecorded: jest.fn().mockResolvedValue(3) }
    const log = jest.spyOn(Logger.prototype, "log")
    const claim = new PasskeyRelyingPartyClaimService(passkeys as any, labRelyingParties())

    await claim.onApplicationBootstrap()

    expect(passkeys.claimUnrecorded).toHaveBeenCalledWith(LAB_RELYING_PARTY.id)
    const logged = log.mock.calls.map((call) => call[0] as LoggedEvent)
    expect(logged).toEqual([
      { message: "passkeys_relying_party_claimed", fields: { event: "passkeys_relying_party_claimed", passkeys: 3 } }
    ])

    expect(JSON.stringify(logged)).not.toContain(LAB_RELYING_PARTY.id)
  })

  it("says nothing once every passkey records its relying party", async () => {
    const passkeys = { claimUnrecorded: jest.fn().mockResolvedValue(0) }
    const log = jest.spyOn(Logger.prototype, "log")

    await new PasskeyRelyingPartyClaimService(passkeys as any, labRelyingParties()).onApplicationBootstrap()

    expect(log).not.toHaveBeenCalled()
  })

  it("stops the start when the database cannot be written, so no request meets an unclaimed passkey", async () => {
    const passkeys = { claimUnrecorded: jest.fn().mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.5:5432")) }
    const claim = new PasskeyRelyingPartyClaimService(passkeys as any, labRelyingParties())

    await expect(claim.onApplicationBootstrap()).rejects.toThrow("ECONNREFUSED")
  })

  it("is wired by the module: one set of relying parties, read from the settings, for every service", async () => {
    const settings: Record<string, string> = {
      IDENTITY_WEBAUTHN_ORIGINS: `${ONION_RELYING_PARTY.origin},${LAB_RELYING_PARTY.origin}`,
      IDENTITY_WEBAUTHN_RP_NAME: "Kinetix Backoffice"
    }

    const passkeys = { claimUnrecorded: jest.fn().mockResolvedValue(0) }
    const moduleRef = await Test.createTestingModule({
      providers: [
        RELYING_PARTIES_PROVIDER,
        PASSKEY_CEREMONY_PROVIDER,
        AuthUsecaseService,
        PasskeyUsecaseService,
        PasskeyRelyingPartyClaimService,
        { provide: ConfigService, useValue: { get: (name: string) => settings[name] } },
        { provide: "UserRepositoryPort", useValue: {} },
        { provide: "PasskeyRepositoryPort", useValue: passkeys },
        { provide: "PasskeyChallengeRepositoryPort", useValue: {} },
        { provide: TokenService, useValue: {} },
        { provide: PrincipalResolverService, useValue: {} },
        { provide: SignInAttemptsService, useValue: {} },
        { provide: ClientGateService, useValue: {} }
      ]
    }).compile()

    await moduleRef.init()

    const parties = moduleRef.get(RelyingParties)
    expect(parties.first.id).toBe(ONION_RELYING_PARTY.id)
    expect(Reflect.get(moduleRef.get(PasskeyUsecaseService), "relyingParties")).toBe(parties)
    expect(Reflect.get(moduleRef.get(AuthUsecaseService), "relyingParties")).toBe(parties)
    expect(passkeys.claimUnrecorded).toHaveBeenCalledWith(ONION_RELYING_PARTY.id)

    await moduleRef.close()
  })
})
