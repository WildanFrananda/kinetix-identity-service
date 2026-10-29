import type PasskeyEntity from "../domain/entities/passkey.entity"
import type { PasskeyRefusalReason } from "./passkey_refusal_reason.type"

type PasskeyAssertionOutcome =
  | { outcome: "verified"; passkey: PasskeyEntity; signCount: number; backedUp: boolean }
  | { outcome: "refused"; reason: PasskeyRefusalReason; detail: string }

export type { PasskeyAssertionOutcome }
