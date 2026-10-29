import type { PasskeyCredential } from "./passkey_credential.type"

type PasskeyRegistrationOutcome =
  | { outcome: "verified"; credential: PasskeyCredential }
  | { outcome: "refused"; detail: string }

export type { PasskeyRegistrationOutcome }
