import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from "@nestjs/common"
import SignInAttemptsService from "./sign_in_attempts.service"
import TokenService from "./token.service"

const SWEEP_INTERVAL_MS = 10 * 60 * 1000

@Injectable()
class ExpiredRecordSweeperService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ExpiredRecordSweeperService.name)
  private timer: NodeJS.Timeout | null = null

  constructor(
    private readonly signInAttempts: SignInAttemptsService,
    private readonly tokenService: TokenService
  ) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => {
      void this.sweep()
    }, SWEEP_INTERVAL_MS)
    this.timer.unref()
  }

  onModuleDestroy(): void {
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  async sweep(): Promise<void> {
    try {
      const attempts: number = await this.signInAttempts.sweep()
      const revocations: number = await this.tokenService.sweepExpiredRevocations()

      this.logger.log({
        message: "expired sign-in records swept",
        fields: { sign_in_attempts: attempts, revoked_access_tokens: revocations }
      })
    } catch (error: unknown) {
      this.logger.warn({
        message: "expired sign-in records could not be swept; the next sweep tries again",
        fields: { reason: error instanceof Error ? error.message : String(error) }
      })
    }
  }
}

export default ExpiredRecordSweeperService
