import type UserEntity from "../domain/entities/user.entity"

type AttemptState = {
  attempts: number
  lastAttemptAt: Date
  delayedUntil: Date
}

type LockedAttemptRow = AttemptState & {
  now: Date
}

type AttemptAdmission =
  | { admitted: true; attempts: number; delayedUntil: Date }
  | { admitted: false; retryAfterSeconds: number }

type AdmittedAttempt = {
  attempts: number
}

type ChallengeAttempt = {
  jti: string
  expiresAt: Date
  limit: number
}

type ChallengeAdmission =
  | { outcome: "admitted"; attempts: number }
  | { outcome: "delayed"; retryAfterSeconds: number }
  | { outcome: "exhausted" }

type SignInStage = "password" | "two_factor" | "passkey"

type SignInRole = "admin" | "other"

type SignInFailureReason =
  | "unknown_account"
  | "wrong_password"
  | "wrong_code"
  | "code_reused"
  | "unknown_passkey"
  | "passkey_refused"
  | "no_passkey_challenge"
  | "sign_count_regressed"

type SignInFailure = {
  stage: SignInStage
  reason: SignInFailureReason
  email: string
  user: UserEntity | null
  attempt: AdmittedAttempt
  detail?: string
}

export type {
  AdmittedAttempt,
  AttemptAdmission,
  AttemptState,
  ChallengeAdmission,
  ChallengeAttempt,
  LockedAttemptRow,
  SignInFailure,
  SignInFailureReason,
  SignInRole,
  SignInStage
}
