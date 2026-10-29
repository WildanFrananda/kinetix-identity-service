import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON
} from "@simplewebauthn/server"
import PasskeyEntity from "../entities/passkey.entity"
import type { PasskeyAccount } from "../../types/passkey_account.type"
import type { PasskeyAssertionOutcome } from "../../types/passkey_assertion_outcome.type"
import type { PasskeyRegistrationOutcome } from "../../types/passkey_registration_outcome.type"

interface PasskeyCeremonyPort {
  registrationOptions(
    account: PasskeyAccount,
    held: readonly PasskeyEntity[],
    lifetimeSeconds: number
  ): Promise<PublicKeyCredentialCreationOptionsJSON>
  verifyRegistration(credential: Record<string, unknown>, expectedChallenge: string): Promise<PasskeyRegistrationOutcome>
  signInOptions(held: readonly PasskeyEntity[], lifetimeSeconds: number): Promise<PublicKeyCredentialRequestOptionsJSON>
  verifySignIn(
    credential: Record<string, unknown>,
    expectedChallenge: string,
    held: readonly PasskeyEntity[]
  ): Promise<PasskeyAssertionOutcome>
}

export default PasskeyCeremonyPort
