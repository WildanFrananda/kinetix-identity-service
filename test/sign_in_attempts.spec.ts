import { randomUUID } from "crypto"
import { DataSource } from "typeorm"
import {
  admitAttempt,
  ATTEMPTS_BEFORE_DELAY,
  ATTEMPTS_PER_CHALLENGE,
  FORGET_AFTER_SECONDS
} from "../src/domain/sign_in_attempt_policy"
import TypeormSignInAttemptRepositoryAdapter from "../src/infrastructure/persistence/adapters/typeorm_sign_in_attempt_repository.adapter"
import AccountSignInAttemptTypeormEntity from "../src/infrastructure/persistence/entities/account_sign_in_attempt_typeorm.entity"
import type { ChallengeAttempt } from "../src/types/sign_in_attempt.type"

const connectionString = process.env.KINETIX_TEST_POSTGRES

const describeWithDatabase = connectionString ? describe : describe.skip

describeWithDatabase("sign-in attempts against a real database", () => {
  let dataSource: DataSource
  let attempts: TypeormSignInAttemptRepositoryAdapter

  beforeAll(async () => {
    dataSource = (await import("../src/data-source")).default
    await dataSource.initialize()
    await dataSource.runMigrations()

    attempts = new TypeormSignInAttemptRepositoryAdapter(dataSource.getRepository(AccountSignInAttemptTypeormEntity))

    await Promise.all(Array.from({ length: 8 }, () => dataSource.query("SELECT pg_sleep(0.02)")))
  }, 60000)

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy()
    }
  })

  beforeEach(async () => {
    await dataSource.query(`DELETE FROM "account_sign_in_attempts"`)
    await dataSource.query(`DELETE FROM "two_factor_challenge_attempts"`)
  })

  function openChallenge(): ChallengeAttempt {
    return { jti: randomUUID(), expiresAt: new Date(Date.now() + 300_000), limit: ATTEMPTS_PER_CHALLENGE }
  }

  async function countedOn(accountKey: string): Promise<number | null> {
    const rows: { attempts: number }[] = await dataSource.query(
      `SELECT "attempts" FROM "account_sign_in_attempts" WHERE "accountKey" = $1`,
      [accountKey]
    )

    return rows[0]?.attempts ?? null
  }

  async function untilAClaimWaitsForTheRow(): Promise<void> {
    for (let poll = 0; poll < 250; poll++) {
      const rows: { waiting: number }[] = await dataSource.query(
        `SELECT count(*)::int AS "waiting" FROM pg_locks WHERE NOT granted`
      )
      if ((rows[0]?.waiting ?? 0) > 0) {
        return
      }

      await dataSource.query("SELECT pg_sleep(0.02)")
    }

    throw new Error("no claim ever waited for the account's row")
  }

  async function challengeAttempts(jti: string): Promise<number | null> {
    const rows: { attempts: number }[] = await dataSource.query(
      `SELECT "attempts" FROM "two_factor_challenge_attempts" WHERE "jti" = $1`,
      [jti]
    )

    return rows[0]?.attempts ?? null
  }

  it("counts attempts and starts a delay at the fifth", async () => {
    const outcomes = []
    for (let attempt = 0; attempt < 6; attempt++) {
      outcomes.push(await attempts.claimAccountAttempt("account-a", admitAttempt))
    }

    expect(outcomes.slice(0, 5).map((outcome) => outcome.admitted && outcome.attempts)).toEqual([1, 2, 3, 4, 5])
    expect(outcomes[5]).toEqual({ admitted: false, retryAfterSeconds: 1 })
  })

  it("lets no more than five of twenty simultaneous attempts through", async () => {
    const outcomes = await Promise.all(
      Array.from({ length: 20 }, () => attempts.claimAccountAttempt("account-b", admitAttempt))
    )

    expect(outcomes.filter((outcome) => outcome.admitted)).toHaveLength(ATTEMPTS_BEFORE_DELAY)
  })

  it("judges a claim that waited for the row by when it decides, not when its transaction began", async () => {
    await attempts.claimAccountAttempt("account-skew", admitAttempt)

    const meanwhile = dataSource.createQueryRunner()
    await meanwhile.connect()
    await meanwhile.startTransaction()
    await meanwhile.query(
      `SELECT 1 FROM "account_sign_in_attempts" WHERE "accountKey" = $1 FOR UPDATE`,
      ["account-skew"]
    )

    const waiting = attempts.claimAccountAttempt("account-skew", admitAttempt)
    await untilAClaimWaitsForTheRow()

    await meanwhile.query("SELECT pg_sleep(0.02)")
    await meanwhile.query(
      `UPDATE "account_sign_in_attempts"
       SET "attempts" = "attempts" + 1, "lastAttemptAt" = clock_timestamp(), "delayedUntil" = clock_timestamp()
       WHERE "accountKey" = $1`,
      ["account-skew"]
    )
    await meanwhile.commitTransaction()
    await meanwhile.release()

    expect(await waiting).toEqual(expect.objectContaining({ admitted: true, attempts: 3 }))
  })

  it("keeps accounts apart", async () => {
    for (let attempt = 0; attempt < 6; attempt++) {
      await attempts.claimAccountAttempt("account-c", admitAttempt)
    }

    expect((await attempts.claimAccountAttempt("account-d", admitAttempt)).admitted).toBe(true)
  })

  it("starts again from nothing once cleared", async () => {
    for (let attempt = 0; attempt < 6; attempt++) {
      await attempts.claimAccountAttempt("account-e", admitAttempt)
    }

    await attempts.clearAccountAttempts("account-e")

    expect(await attempts.claimAccountAttempt("account-e", admitAttempt)).toEqual(
      expect.objectContaining({ admitted: true, attempts: 1 })
    )
  })

  it("burns a challenge after five attempts, even when they arrive together, and counts only those", async () => {
    const challenge = openChallenge()

    const together = await Promise.all(
      Array.from({ length: 10 }, () => attempts.claimChallengeAttempt("account-f", admitAttempt, challenge))
    )

    expect(together.filter((admission) => admission.outcome === "admitted")).toHaveLength(5)
    expect(together.filter((admission) => admission.outcome === "exhausted")).toHaveLength(5)
    expect(await countedOn("account-f")).toBe(5)

    expect(await attempts.claimChallengeAttempt("account-f", admitAttempt, challenge)).toEqual({ outcome: "exhausted" })
    expect(await countedOn("account-f")).toBe(5)
    expect(await challengeAttempts(challenge.jti)).toBe(5)

    expect(await attempts.claimChallengeAttempt("account-g", admitAttempt, openChallenge())).toEqual({
      outcome: "admitted",
      attempts: 1
    })
  })

  it("answers a delayed account without spending an attempt of the challenge", async () => {
    for (let attempt = 0; attempt < ATTEMPTS_BEFORE_DELAY; attempt++) {
      await attempts.claimAccountAttempt("account-h", admitAttempt)
    }
    const challenge = openChallenge()

    expect(await attempts.claimChallengeAttempt("account-h", admitAttempt, challenge)).toEqual({
      outcome: "delayed",
      retryAfterSeconds: 1
    })
    expect(await challengeAttempts(challenge.jti)).toBeNull()
    expect(await countedOn("account-h")).toBe(ATTEMPTS_BEFORE_DELAY)
  })

  it("answers an exhausted challenge as exhausted while its account is delayed, counting nothing", async () => {
    const challenge = openChallenge()
    for (let attempt = 0; attempt < ATTEMPTS_PER_CHALLENGE; attempt++) {
      await attempts.claimChallengeAttempt("account-i", admitAttempt, challenge)
    }

    expect(await attempts.claimChallengeAttempt("account-i", admitAttempt, challenge)).toEqual({ outcome: "exhausted" })
    expect(await countedOn("account-i")).toBe(ATTEMPTS_PER_CHALLENGE)
  })

  it("sweeps forgotten accounts and expired challenges, and nothing that still counts", async () => {
    await attempts.claimAccountAttempt("account-live", admitAttempt)
    await dataSource.query(
      `INSERT INTO "account_sign_in_attempts" ("accountKey", "attempts", "lastAttemptAt", "delayedUntil")
       VALUES ('account-old', 9, now() - interval '2 hours', now() - interval '2 hours')`
    )
    await attempts.claimChallengeAttempt("account-live", admitAttempt, {
      ...openChallenge(),
      expiresAt: new Date(Date.now() - 1000)
    })
    const live = openChallenge()
    await attempts.claimChallengeAttempt("account-live", admitAttempt, live)

    const swept = await attempts.sweep(FORGET_AFTER_SECONDS)

    const accounts = await dataSource.query(`SELECT "accountKey" FROM "account_sign_in_attempts"`)
    const challenges = await dataSource.query(`SELECT "jti" FROM "two_factor_challenge_attempts"`)
    expect(swept).toBe(2)
    expect(accounts).toEqual([{ accountKey: "account-live" }])
    expect(challenges).toEqual([{ jti: live.jti }])
  })
})
