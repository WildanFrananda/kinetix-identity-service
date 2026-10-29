import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse
} from "@simplewebauthn/server"
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
  VerifiedAuthenticationResponse,
  VerifiedRegistrationResponse
} from "@simplewebauthn/server"
import PasskeyEntity from "../../domain/entities/passkey.entity"
import PasskeyCeremonyPort from "../../domain/ports/passkey_ceremony.port"
import type { PasskeyAccount } from "../../types/passkey_account.type"
import type { PasskeyAssertionOutcome } from "../../types/passkey_assertion_outcome.type"
import type { PasskeyRegistrationOutcome } from "../../types/passkey_registration_outcome.type"
import type { RelyingParty } from "../../types/relying_party.type"

const COSE_ES256 = -7

const COSE_RS256 = -257

const PASSKEY_ALGORITHMS: readonly number[] = [COSE_ES256, COSE_RS256]

class SimpleWebAuthnCeremonyAdapter implements PasskeyCeremonyPort {
  constructor(private readonly relyingParty: RelyingParty) {}

  async registrationOptions(
    account: PasskeyAccount,
    held: readonly PasskeyEntity[],
    lifetimeSeconds: number
  ): Promise<PublicKeyCredentialCreationOptionsJSON> {
    return await generateRegistrationOptions({
      rpName: this.relyingParty.name,
      rpID: this.relyingParty.id,
      userName: account.userName,
      userID: new TextEncoder().encode(account.userHandle),
      userDisplayName: account.userName,
      timeout: lifetimeSeconds * 1000,
      attestationType: "none",
      excludeCredentials: held.map(descriptorOf),
      authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
      supportedAlgorithmIDs: [...PASSKEY_ALGORITHMS]
    })
  }

  async verifyRegistration(
    credential: Record<string, unknown>,
    expectedChallenge: string
  ): Promise<PasskeyRegistrationOutcome> {
    let verification: VerifiedRegistrationResponse

    try {
      verification = await verifyRegistrationResponse({
        response: credential as unknown as RegistrationResponseJSON,
        expectedChallenge,
        expectedOrigin: this.relyingParty.origin,
        expectedRPID: this.relyingParty.id,
        requireUserPresence: true,
        requireUserVerification: true,
        supportedAlgorithmIDs: [...PASSKEY_ALGORITHMS]
      })
    } catch (error: unknown) {
      return { outcome: "refused", detail: detailOf(error) }
    }

    if (!verification.verified) {
      return { outcome: "refused", detail: "the attestation did not verify" }
    }

    const info = verification.registrationInfo

    return {
      outcome: "verified",
      credential: {
        credentialId: info.credential.id,
        publicKey: new Uint8Array(info.credential.publicKey),
        signCount: info.credential.counter,
        transports: info.credential.transports ?? [],
        deviceType: info.credentialDeviceType,
        backedUp: info.credentialBackedUp
      }
    }
  }

  async signInOptions(
    held: readonly PasskeyEntity[],
    lifetimeSeconds: number
  ): Promise<PublicKeyCredentialRequestOptionsJSON> {
    return await generateAuthenticationOptions({
      rpID: this.relyingParty.id,
      allowCredentials: held.map(descriptorOf),
      userVerification: "required",
      timeout: lifetimeSeconds * 1000
    })
  }

  async verifySignIn(
    credential: Record<string, unknown>,
    expectedChallenge: string,
    held: readonly PasskeyEntity[]
  ): Promise<PasskeyAssertionOutcome> {
    const passkey = held.find(function (candidate: PasskeyEntity): boolean {
      return candidate.credentialId === credential.id
    })
    if (passkey === undefined) {
      return { outcome: "refused", reason: "unknown_passkey", detail: "the credential is none of the account's passkeys" }
    }

    let verification: VerifiedAuthenticationResponse

    try {
      verification = await verifyAuthenticationResponse({
        response: credential as unknown as AuthenticationResponseJSON,
        expectedChallenge,
        expectedOrigin: this.relyingParty.origin,
        expectedRPID: this.relyingParty.id,
        credential: {
          id: passkey.credentialId,
          publicKey: passkey.publicKey,
          counter: passkey.signCount,
          transports: passkey.transports
        },
        requireUserVerification: true
      })
    } catch (error: unknown) {
      return { outcome: "refused", reason: "passkey_refused", detail: detailOf(error) }
    }

    if (!verification.verified) {
      return { outcome: "refused", reason: "passkey_refused", detail: "the signature did not verify" }
    }

    return {
      outcome: "verified",
      passkey,
      signCount: verification.authenticationInfo.newCounter,
      backedUp: verification.authenticationInfo.credentialBackedUp
    }
  }
}

function descriptorOf(passkey: PasskeyEntity): { id: string; transports: string[] } {
  return { id: passkey.credentialId, transports: passkey.transports }
}

function detailOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export default SimpleWebAuthnCeremonyAdapter
