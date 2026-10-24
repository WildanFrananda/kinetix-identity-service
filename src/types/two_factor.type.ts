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

type EnrolmentClaims = {
  sub: string
  jti: string
  iss: string
  aud: string
  exp: number
  iat: number
  token_use: "mfa_enrolment"
  azp?: string
  uid: number
}

type TwoFactorEnrolment = {
  mfaEnrolmentRequired: true
  enrolmentToken: string
  tokenType: "Bearer"
  expiresIn: number
  userId: number
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

export type {
  EnrolmentClaims,
  MfaChallengeClaims,
  TwoFactorChallenge,
  TwoFactorCodeInput,
  TwoFactorEnrolment,
  TwoFactorSetup
}
