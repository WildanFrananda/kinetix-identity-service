import { generateKeyPairSync } from "crypto"
import { DataSource } from "typeorm"
import * as jwt from "jsonwebtoken"
import TokenService from "../src/application/services/token.service"
import MerchantEntity from "../src/domain/entities/merchant.entity"
import MerchantVerificationEntity from "../src/domain/entities/merchant_verification.entity"
import ProfileEntity from "../src/domain/entities/profile.entity"
import UserEntity from "../src/domain/entities/user.entity"
import MissingReferenceError from "../src/domain/errors/missing_reference.error"
import RecordConflictError from "../src/domain/errors/record_conflict.error"
import JwtKeyProvider from "../src/infrastructure/crypto/jwt_key_provider"
import TypeormCourierApplicationRepositoryAdapter from "../src/infrastructure/persistence/adapters/typeorm_courier_application_repository.adapter"
import TypeormMerchantRepositoryAdapter from "../src/infrastructure/persistence/adapters/typeorm_merchant_repository.adapter"
import TypeormMerchantVerificationRepositoryAdapter from "../src/infrastructure/persistence/adapters/typeorm_merchant_verification_repository.adapter"
import TypeormProfileRepositoryAdapter from "../src/infrastructure/persistence/adapters/typeorm_profile_repository.adapter"
import TypeormUserRepositoryAdapter from "../src/infrastructure/persistence/adapters/typeorm_user_repository.adapter"
import CourierApplicationTypeormEntity from "../src/infrastructure/persistence/entities/courier_application_typeorm.entity"
import MerchantTypeormEntity from "../src/infrastructure/persistence/entities/merchant_typeorm.entity"
import MerchantVerificationTypeormEntity from "../src/infrastructure/persistence/entities/merchant_verification_typeorm.entity"
import PrincipalTypeormEntity from "../src/infrastructure/persistence/entities/principal_typeorm.entity"
import ProfileTypeormEntity from "../src/infrastructure/persistence/entities/profile_typeorm.entity"
import RefreshTokenTypeormEntity from "../src/infrastructure/persistence/entities/refresh_token_typeorm.entity"
import RevokedAccessTokenTypeormEntity from "../src/infrastructure/persistence/entities/revoked_access_token_typeorm.entity"
import UserTypeormEntity from "../src/infrastructure/persistence/entities/user_typeorm.entity"

const connectionString = process.env.KINETIX_TEST_POSTGRES

const describeWithDatabase = connectionString ? describe : describe.skip

const CIKINI = { latitude: -6.1754, longitude: 106.8272 }

describeWithDatabase("account writes against a real database", () => {
  let dataSource: DataSource
  let users: TypeormUserRepositoryAdapter
  let profiles: TypeormProfileRepositoryAdapter
  let merchants: TypeormMerchantRepositoryAdapter
  let verifications: TypeormMerchantVerificationRepositoryAdapter
  let couriers: TypeormCourierApplicationRepositoryAdapter
  let tokens: TokenService

  beforeAll(async () => {
    dataSource = (await import("../src/data-source")).default
    await dataSource.initialize()
    await dataSource.runMigrations()

    users = new TypeormUserRepositoryAdapter(dataSource.getRepository(UserTypeormEntity))
    profiles = new TypeormProfileRepositoryAdapter(dataSource.getRepository(ProfileTypeormEntity))
    merchants = new TypeormMerchantRepositoryAdapter(dataSource.getRepository(MerchantTypeormEntity))
    verifications = new TypeormMerchantVerificationRepositoryAdapter(
      dataSource.getRepository(MerchantVerificationTypeormEntity)
    )
    couriers = new TypeormCourierApplicationRepositoryAdapter(
      dataSource.getRepository(CourierApplicationTypeormEntity)
    )

    const privateKey = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" }
    }).privateKey
    const settings: Record<string, string> = {
      KINETIX_IDENTITY_JWT_PRIVATE_KEY_B64: Buffer.from(privateKey).toString("base64"),
      JWT_ISSUER: "https://identity.kinetix.test",
      JWT_AUDIENCE: "kinetix",
      JWT_ACCESS_TTL_SECONDS: "900",
      JWT_REFRESH_TTL_SECONDS: "2592000"
    }
    const config = { get: (name: string) => settings[name] } as any

    tokens = new TokenService(
      config,
      new JwtKeyProvider(config),
      dataSource.getRepository(RefreshTokenTypeormEntity),
      dataSource.getRepository(RevokedAccessTokenTypeormEntity)
    )
  }, 60000)

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy()
    }
  })

  beforeEach(async () => {
    await dataSource.query(`DELETE FROM "merchants"`)
    await dataSource.query(`DELETE FROM "users"`)
    await dataSource.query(`DELETE FROM "principals"`)
    await dataSource.query(`DELETE FROM "revoked_access_tokens"`)
  })

  async function anAccount(email: string): Promise<UserEntity> {
    return await users.save(new UserEntity(0, email, "not-a-real-hash", "customer"))
  }

  function profileAt(userId: number, latitude?: number, longitude?: number): ProfileEntity {
    return new ProfileEntity(
      0,
      userId,
      "Budi",
      "081200000000",
      "Jl. Cikini",
      "Jakarta",
      "10330",
      undefined,
      latitude,
      longitude,
      new Date()
    )
  }

  function merchantAt(userId: number, latitude?: number, longitude?: number): MerchantEntity {
    return new MerchantEntity(
      0,
      userId,
      "Kinetix",
      "kinetix",
      "brn",
      "tax",
      "verified",
      undefined,
      new Date(),
      "Jl. Cikini",
      "Jakarta",
      "10330",
      latitude,
      longitude,
      new Date()
    )
  }

  async function aPrincipal(): Promise<string> {
    const principal = await dataSource.getRepository(PrincipalTypeormEntity).save(
      dataSource.getRepository(PrincipalTypeormEntity).create({ kind: "PRINCIPAL_KIND_CUSTOMER" })
    )

    return principal.id
  }

  describe("a point that is cleared", () => {
    it("leaves a profile with no point after a failed re-geocode", async () => {
      const account = await anAccount("profile@kinetix.test")
      const placed = await profiles.save(profileAt(account.id, CIKINI.latitude, CIKINI.longitude))

      placed.streetAddress = "Jl. Malioboro"
      placed.latitude = undefined
      placed.longitude = undefined
      await profiles.save(placed)

      const stored = await profiles.findByUserId(account.id)
      expect(stored?.latitude).toBeUndefined()
      expect(stored?.longitude).toBeUndefined()
    })

    it("leaves a merchant with no point after a failed re-geocode", async () => {
      const account = await anAccount("merchant@kinetix.test")
      const placed = await merchants.save(merchantAt(account.id, CIKINI.latitude, CIKINI.longitude))

      placed.streetAddress = "Jl. Malioboro"
      placed.latitude = undefined
      placed.longitude = undefined
      await merchants.save(placed)

      const stored = await merchants.findByUserId(account.id)
      expect(stored?.latitude).toBeUndefined()
      expect(stored?.longitude).toBeUndefined()
    })

    it("stores no invented description for a merchant that has none", async () => {
      const account = await anAccount("plain@kinetix.test")
      await merchants.save(new MerchantEntity(0, account.id, "Plain", "plain", "brn", "tax", "verified"))

      const [row] = await dataSource.query(
        `SELECT "description" FROM "merchants" WHERE "userId" = $1`,
        [account.id]
      )
      expect(row.description).toBeNull()
    })
  })

  describe("a second factor", () => {
    it("forgets the secret when it is turned off", async () => {
      const account = await anAccount("secret@kinetix.test")
      account.twoFactorSecret = "JBSWY3DPEHPK3PXP"
      account.isTwoFactorEnabled = true
      await users.save(account)

      account.twoFactorSecret = null
      account.isTwoFactorEnabled = false
      await users.save(account)

      const [row] = await dataSource.query(
        `SELECT "twoFactorSecret" FROM "users" WHERE "id" = $1`,
        [account.id]
      )
      expect(row.twoFactorSecret).toBeNull()
    })

    it("accepts each time step once, and never an earlier one", async () => {
      const account = await anAccount("steps@kinetix.test")

      expect(await users.acceptTwoFactorStep(account.id, 1000)).toBe(true)
      expect(await users.acceptTwoFactorStep(account.id, 1000)).toBe(false)
      expect(await users.acceptTwoFactorStep(account.id, 999)).toBe(false)
      expect(await users.acceptTwoFactorStep(account.id, 1001)).toBe(true)
    })

    it("lets only one of two simultaneous uses of a step through", async () => {
      const account = await anAccount("race@kinetix.test")

      const outcomes = await Promise.all([
        users.acceptTwoFactorStep(account.id, 2000),
        users.acceptTwoFactorStep(account.id, 2000)
      ])

      expect(outcomes.filter((accepted) => accepted)).toHaveLength(1)
    })

    it("answers a challenge once", async () => {
      const principalId = await aPrincipal()
      const subject = { id: 1, email: "c@kinetix.test", role: "customer" }
      const claims = tokens.peekMfaChallenge(tokens.issueMfaChallenge(subject, principalId).token)

      await expect(tokens.consumeMfaChallenge(claims)).resolves.toBeUndefined()
      await expect(tokens.consumeMfaChallenge(claims)).rejects.toThrow("already been answered")
    })

    it("ends the other sessions and keeps the caller's", async () => {
      const principalId = await aPrincipal()
      const subject = { id: 1, email: "s@kinetix.test", role: "customer" }
      const current = await tokens.issuePair(subject, principalId)
      const other = await tokens.issuePair(subject, principalId)
      const family = String((jwt.decode(current.accessToken) as jwt.JwtPayload).fam)

      await tokens.revokeOtherSessions(principalId, family, "two_factor_enabled")

      await expect(tokens.rotate(other.refreshToken, subject)).rejects.toThrow("revoked")
      await expect(tokens.rotate(current.refreshToken, subject)).resolves.toBeDefined()
    })

    it("logs out twice without an error", async () => {
      const principalId = await aPrincipal()
      const pair = await tokens.issuePair({ id: 1, email: "l@kinetix.test", role: "customer" }, principalId)
      const claims = await tokens.verifyAccess(pair.accessToken)

      await tokens.logout(claims)
      await expect(tokens.logout(claims)).resolves.toBeUndefined()
      await expect(tokens.verifyAccess(pair.accessToken)).rejects.toThrow("revoked")
    })
  })

  describe("emails", () => {
    it("finds an account whatever case its email is typed in", async () => {
      const account = await anAccount("Mixed.Case@Kinetix.Test")

      expect((await users.findByEmail("mixed.case@kinetix.test"))?.id).toBe(account.id)
      expect((await users.findByEmail("MIXED.CASE@KINETIX.TEST"))?.id).toBe(account.id)
    })

    it("refuses a second account whose email differs only by case", async () => {
      await anAccount("taken@kinetix.test")

      await expect(anAccount("Taken@Kinetix.Test")).rejects.toBeInstanceOf(RecordConflictError)
    })
  })

  describe("writes that name what is not there", () => {
    it("answers a profile for an account that does not exist as missing", async () => {
      await expect(
        profiles.save(new ProfileEntity(0, 2147483000, "Nobody", "", "", "", ""))
      ).rejects.toBeInstanceOf(MissingReferenceError)
    })

    it("answers a second first profile written at the same time as a conflict", async () => {
      const account = await anAccount("twice@kinetix.test")

      const outcomes = await Promise.allSettled([
        profiles.save(new ProfileEntity(0, account.id, "One", "", "", "", "")),
        profiles.save(new ProfileEntity(0, account.id, "Two", "", "", "", ""))
      ])

      const refused = outcomes.filter((outcome) => outcome.status === "rejected") as PromiseRejectedResult[]
      expect(refused).toHaveLength(1)
      expect(refused[0].reason).toBeInstanceOf(RecordConflictError)
    })

    it("answers a merchant whose slug is taken as a conflict", async () => {
      const first = await anAccount("first@kinetix.test")
      const second = await anAccount("second@kinetix.test")
      await merchants.save(new MerchantEntity(0, first.id, "Same", "same", "brn", "tax", "verified"))

      await expect(
        merchants.save(new MerchantEntity(0, second.id, "Same", "same", "brn", "tax", "verified"))
      ).rejects.toBeInstanceOf(RecordConflictError)
    })
  })

  describe("applicant lists", () => {
    it("lists seller applications with the applicant's email, by status", async () => {
      const pending = await anAccount("pending@kinetix.test")
      const rejected = await anAccount("rejected@kinetix.test")
      await verifications.save(new MerchantVerificationEntity(0, pending.id, "P", "brn", "tax", "pending"))
      await verifications.save(new MerchantVerificationEntity(0, rejected.id, "R", "brn", "tax", "rejected"))

      const page = await verifications.list({ status: "pending", afterId: 0, limit: 10 })

      expect(page.applications.map((application) => application.email)).toEqual(["pending@kinetix.test"])
      expect(page.nextAfterId).toBeNull()
    })

    it("pages seller applications", async () => {
      for (const name of ["a", "b", "c"]) {
        const account = await anAccount(`${name}@kinetix.test`)
        await verifications.save(new MerchantVerificationEntity(0, account.id, name, "brn", "tax", "pending"))
      }

      const first = await verifications.list({ status: null, afterId: 0, limit: 2 })
      const second = await verifications.list({ status: null, afterId: first.nextAfterId ?? -1, limit: 2 })

      expect(first.applications).toHaveLength(2)
      expect(second.applications.map((application) => application.storeName)).toEqual(["c"])
      expect(second.nextAfterId).toBeNull()
    })

    it("files a courier application as pending and approves it once", async () => {
      const account = await anAccount("courier@kinetix.test")
      const principalId = await aPrincipal()

      await couriers.recordFiled({ userId: account.id, principalId, driverId: 42 })
      const filed = await couriers.list({ status: "pending", afterId: 0, limit: 10 })

      await couriers.recordApproved({ userId: account.id, principalId, driverId: 42 })
      const approved = await couriers.list({ status: "approved", afterId: 0, limit: 10 })
      const firstApproval = approved.applications[0].approvedAt

      await couriers.recordFiled({ userId: account.id, principalId, driverId: 42 })
      await couriers.recordApproved({ userId: account.id, principalId, driverId: 42 })
      const again = await couriers.list({ status: null, afterId: 0, limit: 10 })

      expect(filed.applications).toEqual([
        expect.objectContaining({
          email: "courier@kinetix.test",
          driverId: 42,
          status: "pending",
          approvedAt: null
        })
      ])
      expect(approved.applications).toHaveLength(1)
      expect(firstApproval).not.toBeNull()
      expect(again.applications).toEqual([
        expect.objectContaining({ status: "approved", approvedAt: firstApproval })
      ])
    })

    it("refuses a courier application for an account that does not exist", async () => {
      const principalId = await aPrincipal()

      await expect(
        couriers.recordFiled({ userId: 2147483000, principalId, driverId: 1 })
      ).rejects.toBeInstanceOf(MissingReferenceError)
    })
  })
})
