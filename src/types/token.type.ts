import type { EnrolmentClaims } from "./two_factor.type"

type TokenSubject = {
  id: number
  email: string
  role: string
}

type AccessClaims = {
  sub: string
  jti: string
  iss: string
  aud: string
  exp: number
  iat: number
  token_use: "access"
  fam?: string
  azp?: string
  uid: number
  email: string
  role: string
}

type RefreshClaims = {
  sub: string
  jti: string
  iss: string
  aud: string
  exp: number
  iat: number
  token_use: "refresh"
  fam: string
  azp?: string
  uid: number
}

type SessionClaims = AccessClaims | EnrolmentClaims

type TokenPair = {
  accessToken: string
  refreshToken: string
  expiresIn: number
}

type RotatedPair = {
  pair: TokenPair
  bound: boolean
}

type RotationOutcome = RotatedPair | { refused: string } | { mismatch: string | null }

export type {
  AccessClaims,
  RefreshClaims,
  RotatedPair,
  RotationOutcome,
  SessionClaims,
  TokenPair,
  TokenSubject
}
