import type { KeyObject } from "crypto"
import type { ProofRefusalReason } from "./client.type"

type InvalidProofReason = Exclude<ProofRefusalReason, "missing" | "keys_unavailable">

type ProofVerdict =
  | { outcome: "valid" }
  | { outcome: "invalid"; reason: InvalidProofReason }
  | { outcome: "unavailable" }

type SigningKeyLookup =
  | { outcome: "found"; key: KeyObject }
  | { outcome: "unknown" }
  | { outcome: "unavailable" }

type PublishedSigningKey = {
  kid: string
  key: KeyObject
}

type EpochClock = () => number

export type { EpochClock, InvalidProofReason, ProofVerdict, PublishedSigningKey, SigningKeyLookup }
