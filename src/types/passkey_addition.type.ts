import type PasskeyEntity from "../domain/entities/passkey.entity"

type PasskeyAddition =
  | { outcome: "added"; passkey: PasskeyEntity }
  | { outcome: "limit" }
  | { outcome: "duplicate" }

export type { PasskeyAddition }
