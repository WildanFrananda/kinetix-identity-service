import { generateKeyPairSync } from "crypto"
import { DataSource, IsNull } from "typeorm"
import * as jwt from "jsonwebtoken"
import TokenService from "../src/application/services/token.service"
import JwtKeyProvider from "../src/infrastructure/crypto/jwt_key_provider"
import PrincipalTypeormEntity from "../src/infrastructure/persistence/entities/principal_typeorm.entity"
import RefreshTokenTypeormEntity from "../src/infrastructure/persistence/entities/refresh_token_typeorm.entity"
import RevokedAccessTokenTypeormEntity from "../src/infrastructure/persistence/entities/revoked_access_token_typeorm.entity"

const connectionString = process.env.KINETIX_TEST_POSTGRES

const describeWithDatabase = connectionString ? describe : describe.skip

const USER = { id: 42, email: "user@kinetix.test", role: "customer" }

describeWithDatabase("refresh rotation against a real database", () => {
  let dataSource: DataSource
  let tokens: TokenService

  beforeAll(async () => {
    dataSource = (await import("../src/data-source")).default
    await dataSource.initialize()
    await dataSource.runMigrations()

    const privateKey = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" }
    }).privateKey
    const settings: Record<string, string> = {
      KINETIX_IDENTITY_JWT_PRIVATE_KEY_B64: Buffer.from(privateKey).toString("base64"),
      JWT_ISSUER: "https://identity.kinetix.test",
      JWT_AUDIENCE: "kinetix"
    }
    const config = { get: (name: string) => settings[name] } as any

    tokens = new TokenService(
      config,
      new JwtKeyProvider(config),
      dataSource.getRepository(RefreshTokenTypeormEntity),
      dataSource.getRepository(RevokedAccessTokenTypeormEntity)
    )

    await Promise.all(Array.from({ length: 8 }, () => dataSource.query("SELECT pg_sleep(0.02)")))
  }, 60000)

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy()
    }
  })

  async function aSession(): Promise<{ familyId: string; refreshToken: string }> {
    const principal = await dataSource.getRepository(PrincipalTypeormEntity).save(
      dataSource.getRepository(PrincipalTypeormEntity).create({ kind: "PRINCIPAL_KIND_CUSTOMER" })
    )
    const pair = await tokens.issuePair(USER, principal.id)
    const familyId = String((jwt.decode(pair.refreshToken) as jwt.JwtPayload).fam)

    return { familyId, refreshToken: pair.refreshToken }
  }

  async function liveTokensIn(familyId: string): Promise<number> {
    return dataSource.getRepository(RefreshTokenTypeormEntity).countBy({ familyId, revokedAt: IsNull() })
  }

  it("lets only one of two simultaneous refreshes through, and revokes the family", async () => {
    for (let race = 0; race < 10; race++) {
      const session = await aSession()

      const results = await Promise.allSettled([
        tokens.rotate(session.refreshToken, USER),
        tokens.rotate(session.refreshToken, USER)
      ])

      const accepted = results.filter((result) => result.status === "fulfilled")
      const refused = results.filter((result) => result.status === "rejected") as PromiseRejectedResult[]

      expect(accepted).toHaveLength(1)
      expect(refused).toHaveLength(1)
      expect(String(refused[0].reason.message)).toContain("already been used")
      expect(await liveTokensIn(session.familyId)).toBe(0)
    }
  })

  it("leaves the winner's new token dead too, so neither copy can keep the session", async () => {
    const session = await aSession()

    const results = await Promise.allSettled([
      tokens.rotate(session.refreshToken, USER),
      tokens.rotate(session.refreshToken, USER)
    ])
    const winner = results.find((result) => result.status === "fulfilled") as PromiseFulfilledResult<{
      refreshToken: string
    }>

    await expect(tokens.rotate(winner.value.refreshToken, USER)).rejects.toThrow("revoked")
  })

  it("still rotates an ordinary session without revoking anything", async () => {
    const session = await aSession()

    const second = await tokens.rotate(session.refreshToken, USER)
    await tokens.rotate(second.refreshToken, USER)

    expect(await liveTokensIn(session.familyId)).toBe(3)
  })
})
