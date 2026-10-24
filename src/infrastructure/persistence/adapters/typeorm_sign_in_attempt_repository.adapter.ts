import { Injectable } from "@nestjs/common"
import { InjectRepository } from "@nestjs/typeorm"
import { LessThan, Repository } from "typeorm"
import SignInAttemptRepositoryPort from "../../../domain/ports/sign_in_attempt_repository.port"
import type { AttemptAdmission, AttemptState, LockedAttemptRow } from "../../../types/sign_in_attempt.type"
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
      await manager.query(
        `INSERT INTO "account_sign_in_attempts" ("accountKey", "attempts", "lastAttemptAt", "delayedUntil")
         VALUES ($1, 0, now(), now())
         ON CONFLICT ("accountKey") DO NOTHING`,
        [accountKey]
      )

      const rows: LockedAttemptRow[] = await manager.query(
        `SELECT "attempts", "lastAttemptAt", "delayedUntil", now() AS "now"
         FROM "account_sign_in_attempts"
         WHERE "accountKey" = $1
         FOR UPDATE`,
        [accountKey]
      )
      const row = rows[0]
      if (row === undefined) {
        throw new Error("the sign-in attempt row was not there after it was written")
      }

      const admission = decide(
        { attempts: row.attempts, lastAttemptAt: row.lastAttemptAt, delayedUntil: row.delayedUntil },
        row.now
      )
      if (!admission.admitted) {
        return admission
      }

      await manager.query(
        `UPDATE "account_sign_in_attempts"
         SET "attempts" = $2, "lastAttemptAt" = $3, "delayedUntil" = $4
         WHERE "accountKey" = $1`,
        [accountKey, admission.attempts, row.now, admission.delayedUntil]
      )

      return admission
    })
  }

  async clearAccountAttempts(accountKey: string): Promise<void> {
    await this.accounts.delete({ accountKey })
  }

  async claimChallengeAttempt(jti: string, expiresAt: Date, limit: number): Promise<boolean> {
    const rows: { attempts: number }[] = await this.accounts.query(
      `INSERT INTO "two_factor_challenge_attempts" AS "challenge" ("jti", "attempts", "expiresAt")
       VALUES ($1, 1, $2)
       ON CONFLICT ("jti") DO UPDATE SET "attempts" = "challenge"."attempts" + 1
       WHERE "challenge"."attempts" < $3
       RETURNING "attempts"`,
      [jti, expiresAt, limit]
    )

    return rows.length === 1
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
}

export default TypeormSignInAttemptRepositoryAdapter
