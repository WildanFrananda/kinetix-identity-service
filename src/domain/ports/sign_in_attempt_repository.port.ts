import type {
  AttemptAdmission,
  AttemptState,
  ChallengeAdmission,
  ChallengeAttempt
} from "../../types/sign_in_attempt.type"

interface SignInAttemptRepositoryPort {
  claimAccountAttempt(
    accountKey: string,
    decide: (state: AttemptState | null, now: Date) => AttemptAdmission
  ): Promise<AttemptAdmission>
  clearAccountAttempts(accountKey: string): Promise<void>
  claimChallengeAttempt(
    accountKey: string,
    decide: (state: AttemptState | null, now: Date) => AttemptAdmission,
    challenge: ChallengeAttempt
  ): Promise<ChallengeAdmission>
  sweep(forgetAfterSeconds: number): Promise<number>
}

export default SignInAttemptRepositoryPort
