import SignInAttemptRepositoryPort from "../../src/domain/ports/sign_in_attempt_repository.port"
import type {
  AttemptAdmission,
  AttemptState,
  ChallengeAdmission,
  ChallengeAttempt
} from "../../src/types/sign_in_attempt.type"

class InMemorySignInAttempts implements SignInAttemptRepositoryPort {
  readonly accounts = new Map<string, AttemptState>()
  readonly challenges = new Map<string, number>()
  private nowMs: number = Date.now()

  advance(seconds: number): void {
    this.nowMs += seconds * 1000
  }

  async claimAccountAttempt(
    accountKey: string,
    decide: (state: AttemptState | null, now: Date) => AttemptAdmission
  ): Promise<AttemptAdmission> {
    const now = new Date(this.nowMs)
    const admission = decide(this.accounts.get(accountKey) ?? null, now)
    if (admission.admitted) {
      this.accounts.set(accountKey, {
        attempts: admission.attempts,
        lastAttemptAt: now,
        delayedUntil: admission.delayedUntil
      })
    }

    return admission
  }

  async clearAccountAttempts(accountKey: string): Promise<void> {
    this.accounts.delete(accountKey)
  }

  async claimChallengeAttempt(
    accountKey: string,
    decide: (state: AttemptState | null, now: Date) => AttemptAdmission,
    challenge: ChallengeAttempt
  ): Promise<ChallengeAdmission> {
    const used = this.challenges.get(challenge.jti) ?? 0
    if (used >= challenge.limit) {
      return { outcome: "exhausted" }
    }

    const admission = await this.claimAccountAttempt(accountKey, decide)
    if (!admission.admitted) {
      return { outcome: "delayed", retryAfterSeconds: admission.retryAfterSeconds }
    }

    this.challenges.set(challenge.jti, used + 1)
    return { outcome: "admitted", attempts: admission.attempts }
  }

  async sweep(): Promise<number> {
    return 0
  }
}

export default InMemorySignInAttempts
