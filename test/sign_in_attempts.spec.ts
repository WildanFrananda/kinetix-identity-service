import { randomUUID } from "crypto"
import { DataSource } from "typeorm"
import { admitAttempt, ATTEMPTS_BEFORE_DELAY, FORGET_AFTER_SECONDS } from "../src/domain/sign_in_attempt_policy"
import TypeormSignInAttemptRepositoryAdapter from "../src/infrastructure/persistence/adapters/typeorm_sign_in_attempt_repository.adapter"
import AccountSignInAttemptTypeormEntity from "../src/infrastructure/persistence/entities/account_sign_in_attempt_typeorm.entity"

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

  it("burns a challenge after five attempts, even when they arrive together", async () => {
    const jti = randomUUID()
    const expiresAt = new Date(Date.now() + 300_000)

    const together = await Promise.all(
      Array.from({ length: 10 }, () => attempts.claimChallengeAttempt(jti, expiresAt, 5))
    )

    expect(together.filter((admitted) => admitted)).toHaveLength(5)
    expect(await attempts.claimChallengeAttempt(jti, expiresAt, 5)).toBe(false)
    expect(await attempts.claimChallengeAttempt(randomUUID(), expiresAt, 5)).toBe(true)
  })

  it("sweeps forgotten accounts and expired challenges, and nothing that still counts", async () => {
    await attempts.claimAccountAttempt("account-live", admitAttempt)
    await dataSource.query(
      `INSERT INTO "account_sign_in_attempts" ("accountKey", "attempts", "lastAttemptAt", "delayedUntil")
       VALUES ('account-old', 9, now() - interval '2 hours', now() - interval '2 hours')`
    )
    await attempts.claimChallengeAttempt(randomUUID(), new Date(Date.now() - 1000), 5)
    const live = randomUUID()
    await attempts.claimChallengeAttempt(live, new Date(Date.now() + 300_000), 5)

    const swept = await attempts.sweep(FORGET_AFTER_SECONDS)

    const accounts = await dataSource.query(`SELECT "accountKey" FROM "account_sign_in_attempts"`)
    const challenges = await dataSource.query(`SELECT "jti" FROM "two_factor_challenge_attempts"`)
    expect(swept).toBe(2)
    expect(accounts).toEqual([{ accountKey: "account-live" }])
    expect(challenges).toEqual([{ jti: live }])
  })
})
