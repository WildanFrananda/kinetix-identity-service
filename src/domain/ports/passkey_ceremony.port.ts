import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON
} from "@simplewebauthn/server"
import PasskeyEntity from "../entities/passkey.entity"
import type { PasskeyAccount } from "../../types/passkey_account.type"
import type { PasskeyAssertionOutcome } from "../../types/passkey_assertion_outcome.type"
import type { PasskeyRegistrationOutcome } from "../../types/passkey_registration_outcome.type"
import type { RelyingParty } from "../../types/relying_party.type"

interface PasskeyCeremonyPort {
  registrationOptions(
    party: RelyingParty,
    account: PasskeyAccount,
    held: readonly PasskeyEntity[],
    lifetimeSeconds: number
  ): Promise<PublicKeyCredentialCreationOptionsJSON>
  verifyRegistration(
    party: RelyingParty,
    credential: Record<string, unknown>,
    expectedChallenge: string
  ): Promise<PasskeyRegistrationOutcome>
  signInOptions(
    party: RelyingParty,
    held: readonly PasskeyEntity[],
    lifetimeSeconds: number
  ): Promise<PublicKeyCredentialRequestOptionsJSON>
  verifySignIn(
    party: RelyingParty,
    credential: Record<string, unknown>,
    expectedChallenge: string,
    held: readonly PasskeyEntity[]
  ): Promise<PasskeyAssertionOutcome>
}

export default PasskeyCeremonyPort
