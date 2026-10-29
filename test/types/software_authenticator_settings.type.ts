import type { KeyObject } from "crypto"

type SoftwareAuthenticatorSettings = {
  algorithm?: "ES256" | "RS256"
  verifiesUser?: boolean
  backedUp?: boolean
  counterStep?: number
  credentialId?: Buffer
  keys?: { privateKey: KeyObject; publicKey: KeyObject }
}

export type { SoftwareAuthenticatorSettings }
