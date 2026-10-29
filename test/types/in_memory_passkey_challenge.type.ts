type InMemoryPasskeyChallenge = {
  id: string
  userId: number
  purpose: "register" | "sign_in"
  challenge: string
  mfaJti: string | null
  expiresAtMs: number
  used: boolean
}

export type { InMemoryPasskeyChallenge }
