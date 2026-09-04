type MfaChallengeClaims = {
  sub: string
  jti: string
  iss: string
  aud: string
  exp: number
  iat: number
  token_use: "mfa_challenge"
  uid: number
}

type TwoFactorChallenge = {
  mfaRequired: true
  challengeToken: string
  expiresIn: number
}

type TwoFactorSetup = {
  twoFactorSecret: string
  qrCodeUrl: string
  enabled: boolean
}

type TwoFactorCodeInput = {
  code: string
}

export type { MfaChallengeClaims, TwoFactorChallenge, TwoFactorCodeInput, TwoFactorSetup }
