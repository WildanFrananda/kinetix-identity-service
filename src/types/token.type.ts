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
  uid: number
}

type TokenPair = {
  accessToken: string
  refreshToken: string
  expiresIn: number
}

export type { AccessClaims, RefreshClaims, TokenPair, TokenSubject }
