import type { AttemptAdmission, AttemptState } from "../../types/sign_in_attempt.type"

interface SignInAttemptRepositoryPort {
  claimAccountAttempt(
    accountKey: string,
    decide: (state: AttemptState | null, now: Date) => AttemptAdmission
  ): Promise<AttemptAdmission>
  clearAccountAttempts(accountKey: string): Promise<void>
  claimChallengeAttempt(jti: string, expiresAt: Date, limit: number): Promise<boolean>
  sweep(forgetAfterSeconds: number): Promise<number>
}

export default SignInAttemptRepositoryPort
