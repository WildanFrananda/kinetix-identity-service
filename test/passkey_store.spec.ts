import { randomBytes, randomUUID } from "crypto"
import { DataSource } from "typeorm"
import { PASSKEYS_PER_ACCOUNT } from "../src/domain/passkey_policy"
import TypeormPasskeyChallengeRepositoryAdapter from "../src/infrastructure/persistence/adapters/typeorm_passkey_challenge_repository.adapter"
import TypeormPasskeyRepositoryAdapter from "../src/infrastructure/persistence/adapters/typeorm_passkey_repository.adapter"
import PasskeyChallengeTypeormEntity from "../src/infrastructure/persistence/entities/passkey_challenge_typeorm.entity"
import PasskeyTypeormEntity from "../src/infrastructure/persistence/entities/passkey_typeorm.entity"
import UserTypeormEntity from "../src/infrastructure/persistence/entities/user_typeorm.entity"
import type { NewPasskey } from "../src/types/new_passkey.type"

const connectionString = process.env.KINETIX_TEST_POSTGRES

const describeWithDatabase = connectionString ? describe : describe.skip

describeWithDatabase("passkeys against a real database", () => {
  let dataSource: DataSource
  let passkeys: TypeormPasskeyRepositoryAdapter
  let challenges: TypeormPasskeyChallengeRepositoryAdapter

  beforeAll(async () => {
    dataSource = (await import("../src/data-source")).default
    await dataSource.initialize()
    await dataSource.runMigrations()

    passkeys = new TypeormPasskeyRepositoryAdapter(dataSource.getRepository(PasskeyTypeormEntity))
    challenges = new TypeormPasskeyChallengeRepositoryAdapter(dataSource.getRepository(PasskeyChallengeTypeormEntity))
  }, 60000)

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy()
    }
  })

  beforeEach(async () => {
    await dataSource.query(`DELETE FROM "passkey_challenges"`)
    await dataSource.query(`DELETE FROM "passkeys"`)
  })

  async function anAccount(name: string): Promise<number> {
    const users = dataSource.getRepository(UserTypeormEntity)
    const saved = await users.save(
      users.create({ email: `${name}-${randomUUID()}@example.test`, passwordHash: "not-a-real-hash" })
    )

    return saved.id
  }

  function aPasskey(userId: number, overrides: Partial<NewPasskey> = {}): NewPasskey {
    return {
      userId,
      credentialId: randomBytes(32).toString("base64url"),
      publicKey: new Uint8Array(randomBytes(77)),
      signCount: 0,
      transports: ["internal", "hybrid"],
      deviceType: "multiDevice",
      backedUp: true,
      name: "Laptop",
      ...overrides
    }
  }

  async function backdate(challengeId: string): Promise<void> {
    await dataSource.query(
      `UPDATE "passkey_challenges" SET "expiresAt" = now() - interval '1 second' WHERE "id" = $1`,
      [challengeId]
    )
  }

  describe("the passkeys", () => {
    it("keep the key's bytes, the transports and the counter as they were written", async () => {
      const userId = await anAccount("keeper")
      const written = aPasskey(userId, { signCount: 4294967295 })

      const added = await passkeys.add(written, PASSKEYS_PER_ACCOUNT)
      const listed = await passkeys.listForUser(userId)

      expect(added.outcome).toBe("added")
      expect(listed).toHaveLength(1)
      expect(Buffer.from(listed[0].publicKey).equals(Buffer.from(written.publicKey))).toBe(true)
      expect(listed[0].transports).toEqual(["internal", "hybrid"])
      expect(listed[0].signCount).toBe(4294967295)
      expect(listed[0].lastUsedAt).toBeNull()
      expect(await passkeys.existsForUser(userId)).toBe(true)
    })

    it("let no more than ten of twenty simultaneous additions through", async () => {
      const userId = await anAccount("crowded")

      const outcomes = await Promise.all(
        Array.from({ length: 20 }, () => passkeys.add(aPasskey(userId), PASSKEYS_PER_ACCOUNT))
      )

      expect(outcomes.filter((outcome) => outcome.outcome === "added")).toHaveLength(10)
      expect(outcomes.filter((outcome) => outcome.outcome === "limit")).toHaveLength(10)
      expect(await passkeys.listForUser(userId)).toHaveLength(10)
    })

    it("answer a credential registered twice as a duplicate, not an error", async () => {
      const first = await anAccount("first")
      const second = await anAccount("second")
      const credentialId = randomBytes(32).toString("base64url")

      const original = await passkeys.add(aPasskey(first, { credentialId }), PASSKEYS_PER_ACCOUNT)
      const copy = await passkeys.add(aPasskey(second, { credentialId }), PASSKEYS_PER_ACCOUNT)

      expect(original.outcome).toBe("added")
      expect(copy.outcome).toBe("duplicate")
      expect(await passkeys.existsForUser(second)).toBe(false)
    })

    it("are removed only by their own account", async () => {
      const owner = await anAccount("owner")
      const stranger = await anAccount("stranger")
      const added = await passkeys.add(aPasskey(owner), PASSKEYS_PER_ACCOUNT)
      if (added.outcome !== "added") {
        throw new Error("the passkey was not added")
      }

      expect(await passkeys.remove(stranger, added.passkey.id)).toBe(false)
      expect(await passkeys.remove(owner, added.passkey.id)).toBe(true)
      expect(await passkeys.remove(owner, added.passkey.id)).toBe(false)
    })

    it("move the counter only forward, and record the use", async () => {
      const userId = await anAccount("counted")
      const added = await passkeys.add(aPasskey(userId, { signCount: 5, backedUp: false }), PASSKEYS_PER_ACCOUNT)
      if (added.outcome !== "added") {
        throw new Error("the passkey was not added")
      }

      expect(await passkeys.recordUse(added.passkey.id, 5, false)).toBe(false)
      expect(await passkeys.recordUse(added.passkey.id, 4, false)).toBe(false)
      expect(await passkeys.recordUse(added.passkey.id, 0, false)).toBe(false)
      expect(await passkeys.recordUse(added.passkey.id, 6, true)).toBe(true)

      const [used] = await passkeys.listForUser(userId)
      expect(used.signCount).toBe(6)
      expect(used.backedUp).toBe(true)
      expect(used.lastUsedAt).toBeInstanceOf(Date)
    })

    it("accept a counter that stays at zero, as synced passkeys report it", async () => {
      const userId = await anAccount("synced")
      const added = await passkeys.add(aPasskey(userId), PASSKEYS_PER_ACCOUNT)
      if (added.outcome !== "added") {
        throw new Error("the passkey was not added")
      }

      expect(await passkeys.recordUse(added.passkey.id, 0, true)).toBe(true)
      expect(await passkeys.recordUse(added.passkey.id, 0, true)).toBe(true)
    })

    it("let one of two simultaneous uses with the same counter through", async () => {
      const userId = await anAccount("raced")
      const added = await passkeys.add(aPasskey(userId, { signCount: 1 }), PASSKEYS_PER_ACCOUNT)
      if (added.outcome !== "added") {
        throw new Error("the passkey was not added")
      }

      const outcomes = await Promise.all([
        passkeys.recordUse(added.passkey.id, 2, true),
        passkeys.recordUse(added.passkey.id, 2, true)
      ])

      expect(outcomes.filter(Boolean)).toHaveLength(1)
    })

    it("go with their account", async () => {
      const userId = await anAccount("leaving")
      await passkeys.add(aPasskey(userId), PASSKEYS_PER_ACCOUNT)
      await challenges.issueRegistration(userId, "challenge", 300)

      await dataSource.query(`DELETE FROM "users" WHERE "id" = $1`, [userId])

      expect(await passkeys.existsForUser(userId)).toBe(false)
      expect(await dataSource.query(`SELECT 1 FROM "passkey_challenges"`)).toHaveLength(0)
    })
  })

  describe("the challenges", () => {
    it("spend a registration challenge once, among ten simultaneous attempts", async () => {
      const userId = await anAccount("racer")
      const challengeId = await challenges.issueRegistration(userId, "registration-challenge", 300)

      const spent = await Promise.all(Array.from({ length: 10 }, () => challenges.spendRegistration(challengeId, userId)))

      expect(spent.filter((challenge) => challenge === "registration-challenge")).toHaveLength(1)
      expect(spent.filter((challenge) => challenge === null)).toHaveLength(9)
    })

    it("do not spend another account's challenge, an expired one, or a sign-in one as a registration", async () => {
      const owner = await anAccount("holder")
      const stranger = await anAccount("borrower")
      const borrowed = await challenges.issueRegistration(owner, "borrowed", 300)
      const expired = await challenges.issueRegistration(owner, "expired", 300)
      const mfaJti = randomUUID()
      await challenges.issueSignIn(owner, mfaJti, "sign-in", 120)
      await backdate(expired)

      expect(await challenges.spendRegistration(borrowed, stranger)).toBeNull()
      expect(await challenges.spendRegistration(expired, owner)).toBeNull()
      expect(await challenges.spendSignIn(mfaJti, stranger)).toBeNull()
      expect(await challenges.spendRegistration(borrowed, owner)).toBe("borrowed")
      expect(await challenges.spendSignIn(mfaJti, owner)).toBe("sign-in")
    })

    it("replace a sign-in challenge with the next options for the same two-factor challenge", async () => {
      const userId = await anAccount("asker")
      const mfaJti = randomUUID()

      await challenges.issueSignIn(userId, mfaJti, "first", 120)
      await challenges.spendSignIn(mfaJti, userId)
      await challenges.issueSignIn(userId, mfaJti, "second", 120)

      const rows: { challenge: string }[] = await dataSource.query(
        `SELECT "challenge" FROM "passkey_challenges" WHERE "mfaJti" = $1`,
        [mfaJti]
      )

      expect(rows).toEqual([{ challenge: "second" }])
      expect(await challenges.spendSignIn(mfaJti, userId)).toBe("second")
      expect(await challenges.spendSignIn(mfaJti, userId)).toBeNull()
    })

    it("refuse a sign-in challenge that names no two-factor challenge", async () => {
      const userId = await anAccount("checked")

      await expect(
        dataSource.query(
          `INSERT INTO "passkey_challenges" ("userId", "purpose", "challenge", "expiresAt")
           VALUES ($1, 'sign_in', 'x', now())`,
          [userId]
        )
      ).rejects.toThrow(/CK_passkey_challenges_mfa_jti/)
    })

    it("are swept once expired, and only then", async () => {
      const userId = await anAccount("swept")
      const expired = await challenges.issueRegistration(userId, "old", 300)
      await challenges.issueRegistration(userId, "fresh", 300)
      await backdate(expired)

      expect(await challenges.sweep()).toBe(1)

      const rows: { challenge: string }[] = await dataSource.query(`SELECT "challenge" FROM "passkey_challenges"`)
      expect(rows).toEqual([{ challenge: "fresh" }])
    })
  })
})
