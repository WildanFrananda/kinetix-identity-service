import { Inject, Injectable, Logger } from "@nestjs/common"
import SignInDelayedError from "../../domain/errors/sign_in_delayed.error"
import SignInAttemptRepositoryPort from "../../domain/ports/sign_in_attempt_repository.port"
import { admitAttempt, ATTEMPTS_PER_CHALLENGE, FORGET_AFTER_SECONDS } from "../../domain/sign_in_attempt_policy"
import { accountKeyOf } from "../../infrastructure/crypto/account_key"
import { recordSignInFailure } from "../../infrastructure/observability/metrics_registry"
import type { CallContext } from "../../types/call_context.type"
import type { AdmittedAttempt, ChallengeAttempt, SignInFailure, SignInRole } from "../../types/sign_in_attempt.type"
import type { MfaChallengeClaims } from "../../types/two_factor.type"

@Injectable()
class SignInAttemptsService {
  private readonly logger = new Logger(SignInAttemptsService.name)

  constructor(
    @Inject("SignInAttemptRepositoryPort")
    private readonly attempts: SignInAttemptRepositoryPort
  ) {}

  async admit(email: string): Promise<AdmittedAttempt> {
    const admission = await this.attempts.claimAccountAttempt(accountKeyOf(email), admitAttempt)
    if (!admission.admitted) {
      throw new SignInDelayedError(admission.retryAfterSeconds)
    }

    return { attempts: admission.attempts }
  }

  async admitChallengeAttempt(email: string, claims: MfaChallengeClaims): Promise<AdmittedAttempt | null> {
    const challenge: ChallengeAttempt = {
      jti: claims.jti,
      expiresAt: new Date(claims.exp * 1000),
      limit: ATTEMPTS_PER_CHALLENGE
    }

    const admission = await this.attempts.claimChallengeAttempt(accountKeyOf(email), admitAttempt, challenge)

    if (admission.outcome === "delayed") {
      throw new SignInDelayedError(admission.retryAfterSeconds)
    }

    if (admission.outcome === "exhausted") {
      return null
    }

    return { attempts: admission.attempts }
  }

  failed(failure: SignInFailure, context: CallContext): void {
    const role: SignInRole = failure.user?.role === "admin" ? "admin" : "other"

    recordSignInFailure(failure.stage, role)

    this.logger.warn({
      message: "sign_in_failure",
      requestId: context.requestId,
      fields: {
        event: "sign_in_failure",
        stage: failure.stage,
        role,
        reason: failure.reason,
        account_key: accountKeyOf(failure.email),
        attempts: failure.attempt.attempts,
        ...(failure.user === null ? {} : { user_id: failure.user.id })
      }
    })
  }

  async succeeded(email: string): Promise<void> {
    await this.attempts.clearAccountAttempts(accountKeyOf(email))
  }

  async sweep(): Promise<number> {
    return await this.attempts.sweep(FORGET_AFTER_SECONDS)
  }
}

export default SignInAttemptsService
