import { Injectable } from "@nestjs/common"
import { InjectRepository } from "@nestjs/typeorm"
import { Repository } from "typeorm"
import PasskeyChallengeRepositoryPort from "../../../domain/ports/passkey_challenge_repository.port"
import PasskeyChallengeTypeormEntity from "../entities/passkey_challenge_typeorm.entity"

@Injectable()
class TypeormPasskeyChallengeRepositoryAdapter implements PasskeyChallengeRepositoryPort {
  constructor(
    @InjectRepository(PasskeyChallengeTypeormEntity)
    private readonly repo: Repository<PasskeyChallengeTypeormEntity>
  ) {}

  async issueRegistration(userId: number, challenge: string, lifetimeSeconds: number): Promise<string> {
    const issued: { id: string }[] = await this.repo.query(
      `INSERT INTO "passkey_challenges" ("userId", "purpose", "challenge", "expiresAt")
       VALUES ($1, 'register', $2, now() + make_interval(secs => $3))
       RETURNING "id"`,
      [userId, challenge, lifetimeSeconds]
    )

    const id = issued[0]?.id
    if (id === undefined) {
      throw new Error("the passkey challenge was not there after it was written")
    }

    return id
  }

  async issueSignIn(userId: number, mfaJti: string, challenge: string, lifetimeSeconds: number): Promise<void> {
    await this.repo.query(
      `INSERT INTO "passkey_challenges" AS "open" ("userId", "purpose", "challenge", "mfaJti", "expiresAt")
       VALUES ($1, 'sign_in', $2, $3, now() + make_interval(secs => $4))
       ON CONFLICT ("mfaJti") DO UPDATE
       SET "challenge" = EXCLUDED."challenge", "expiresAt" = EXCLUDED."expiresAt", "usedAt" = NULL
       WHERE "open"."userId" = EXCLUDED."userId"`,
      [userId, challenge, mfaJti, lifetimeSeconds]
    )
  }

  async spendRegistration(challengeId: string, userId: number): Promise<string | null> {
    return await this.spend(`"id" = :challengeId AND "purpose" = 'register'`, { challengeId }, userId)
  }

  async spendSignIn(mfaJti: string, userId: number): Promise<string | null> {
    return await this.spend(`"mfaJti" = :mfaJti AND "purpose" = 'sign_in'`, { mfaJti }, userId)
  }

  async sweep(): Promise<number> {
    const swept = await this.repo
      .createQueryBuilder()
      .delete()
      .from(PasskeyChallengeTypeormEntity)
      .where(`"expiresAt" < now()`)
      .execute()

    return swept.affected ?? 0
  }

  private async spend(which: string, parameters: Record<string, string>, userId: number): Promise<string | null> {
    const spent = await this.repo
      .createQueryBuilder()
      .update(PasskeyChallengeTypeormEntity)
      .set({ usedAt: () => "now()" })
      .where(which, parameters)
      .andWhere(`"userId" = :userId`, { userId })
      .andWhere(`"usedAt" IS NULL`)
      .andWhere(`"expiresAt" > now()`)
      .returning(["challenge"])
      .execute()

    const rows: { challenge: string }[] = spent.raw

    return rows[0]?.challenge ?? null
  }
}

export default TypeormPasskeyChallengeRepositoryAdapter
