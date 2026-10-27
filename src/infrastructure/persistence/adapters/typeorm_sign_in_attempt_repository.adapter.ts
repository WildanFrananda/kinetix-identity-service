import { Injectable } from "@nestjs/common"
import { InjectRepository } from "@nestjs/typeorm"
import { EntityManager, LessThan, Repository } from "typeorm"
import SignInAttemptRepositoryPort from "../../../domain/ports/sign_in_attempt_repository.port"
import type {
  AttemptAdmission,
  AttemptState,
  ChallengeAdmission,
  ChallengeAttempt,
  LockedAttemptRow
} from "../../../types/sign_in_attempt.type"
import AccountSignInAttemptTypeormEntity from "../entities/account_sign_in_attempt_typeorm.entity"
import TwoFactorChallengeAttemptTypeormEntity from "../entities/two_factor_challenge_attempt_typeorm.entity"

@Injectable()
class TypeormSignInAttemptRepositoryAdapter implements SignInAttemptRepositoryPort {
  constructor(
    @InjectRepository(AccountSignInAttemptTypeormEntity)
    private readonly accounts: Repository<AccountSignInAttemptTypeormEntity>
  ) {}

  async claimAccountAttempt(
    accountKey: string,
    decide: (state: AttemptState | null, now: Date) => AttemptAdmission
  ): Promise<AttemptAdmission> {
    return await this.accounts.manager.transaction(async (manager) => {
      const row = await this.lockAccount(manager, accountKey)

      const admission = decide(stateOf(row), row.now)
      if (!admission.admitted) {
        return admission
      }

      await this.recordAccountAttempt(manager, accountKey, admission, row.now)

      return admission
    })
  }

  async clearAccountAttempts(accountKey: string): Promise<void> {
    await this.accounts.delete({ accountKey })
  }

  async claimChallengeAttempt(
    accountKey: string,
    decide: (state: AttemptState | null, now: Date) => AttemptAdmission,
    challenge: ChallengeAttempt
  ): Promise<ChallengeAdmission> {
    return await this.accounts.manager.transaction(async (manager): Promise<ChallengeAdmission> => {
      const row = await this.lockAccount(manager, accountKey)

      const used: { attempts: number }[] = await manager.query(
        `SELECT "attempts" FROM "two_factor_challenge_attempts" WHERE "jti" = $1`,
        [challenge.jti]
      )
      if ((used[0]?.attempts ?? 0) >= challenge.limit) {
        return { outcome: "exhausted" }
      }

      const admission = decide(stateOf(row), row.now)
      if (!admission.admitted) {
        return { outcome: "delayed", retryAfterSeconds: admission.retryAfterSeconds }
      }

      const claimed: { attempts: number }[] = await manager.query(
        `INSERT INTO "two_factor_challenge_attempts" AS "challenge" ("jti", "attempts", "expiresAt")
         VALUES ($1, 1, $2)
         ON CONFLICT ("jti") DO UPDATE SET "attempts" = "challenge"."attempts" + 1
         WHERE "challenge"."attempts" < $3
         RETURNING "attempts"`,
        [challenge.jti, challenge.expiresAt, challenge.limit]
      )
      if (claimed.length !== 1) {
        return { outcome: "exhausted" }
      }

      await this.recordAccountAttempt(manager, accountKey, admission, row.now)

      return { outcome: "admitted", attempts: admission.attempts }
    })
  }

  async sweep(forgetAfterSeconds: number): Promise<number> {
    const forgotten = await this.accounts
      .createQueryBuilder()
      .delete()
      .from(AccountSignInAttemptTypeormEntity)
      .where(`"lastAttemptAt" < now() - make_interval(secs => :seconds)`, { seconds: forgetAfterSeconds })
      .andWhere(`"delayedUntil" < now()`)
      .execute()

    const expired = await this.accounts.manager
      .getRepository(TwoFactorChallengeAttemptTypeormEntity)
      .delete({ expiresAt: LessThan(new Date()) })

    return (forgotten.affected ?? 0) + (expired.affected ?? 0)
  }

  private async lockAccount(manager: EntityManager, accountKey: string): Promise<LockedAttemptRow> {
    await manager.query(
      `INSERT INTO "account_sign_in_attempts" ("accountKey", "attempts", "lastAttemptAt", "delayedUntil")
       VALUES ($1, 0, clock_timestamp(), clock_timestamp())
       ON CONFLICT ("accountKey") DO NOTHING`,
      [accountKey]
    )

    const rows: AttemptState[] = await manager.query(
      `SELECT "attempts", "lastAttemptAt", "delayedUntil"
       FROM "account_sign_in_attempts"
       WHERE "accountKey" = $1
       FOR UPDATE`,
      [accountKey]
    )
    const row = rows[0]
    if (row === undefined) {
      throw new Error("the sign-in attempt row was not there after it was written")
    }

    const decided: { now: Date }[] = await manager.query(`SELECT clock_timestamp() AS "now"`)
    const now = decided[0]?.now
    if (now === undefined) {
      throw new Error("the database did not say what time it is")
    }

    return { ...row, now }
  }

  private async recordAccountAttempt(
    manager: EntityManager,
    accountKey: string,
    admission: Extract<AttemptAdmission, { admitted: true }>,
    now: Date
  ): Promise<void> {
    await manager.query(
      `UPDATE "account_sign_in_attempts"
       SET "attempts" = $2, "lastAttemptAt" = $3, "delayedUntil" = $4
       WHERE "accountKey" = $1`,
      [accountKey, admission.attempts, now, admission.delayedUntil]
    )
  }
}

function stateOf(row: LockedAttemptRow): AttemptState {
  return { attempts: row.attempts, lastAttemptAt: row.lastAttemptAt, delayedUntil: row.delayedUntil }
}

export default TypeormSignInAttemptRepositoryAdapter
