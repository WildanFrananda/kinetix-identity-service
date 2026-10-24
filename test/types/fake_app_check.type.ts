import type { KeyObject } from "crypto"
import type * as jwt from "jsonwebtoken"

type SigningKey = {
  kid: string
  privateKey: KeyObject
  publicJwk: Record<string, unknown>
}

type KeySetAnswer =
  | { kind: "keys" }
  | { kind: "status"; status: number; body: string; contentType: string }
  | { kind: "drop" }

type ProofOptions = {
  claims?: Record<string, unknown>
  omit?: readonly string[]
  header?: Record<string, unknown>
  algorithm?: jwt.Algorithm
  key?: KeyObject | string
  kid?: string | null
}

export type { KeySetAnswer, ProofOptions, SigningKey }
