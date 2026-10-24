import { generateKeyPairSync } from "crypto"
import { DataSource } from "typeorm"
import * as jwt from "jsonwebtoken"
import TokenService from "../src/application/services/token.service"
import ClientMismatchError from "../src/domain/errors/client_mismatch.error"
import JwtKeyProvider from "../src/infrastructure/crypto/jwt_key_provider"
import PrincipalTypeormEntity from "../src/infrastructure/persistence/entities/principal_typeorm.entity"
import RefreshTokenTypeormEntity from "../src/infrastructure/persistence/entities/refresh_token_typeorm.entity"
import RevokedAccessTokenTypeormEntity from "../src/infrastructure/persistence/entities/revoked_access_token_typeorm.entity"
import type { RequestClient } from "../src/types/client.type"

const connectionString = process.env.KINETIX_TEST_POSTGRES

const describeWithDatabase = connectionString ? describe : describe.skip

const USER = { id: 43, email: "courier@kinetix.test", role: "courier" }

const COURIER_APP: RequestClient = { kind: "named", name: "courier-app" }

const UNNAMED: RequestClient = { kind: "unnamed" }

describeWithDatabase("a session's client in a real database", () => {
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
      JWT_AUDIENCE: "kinetix",
      JWT_ACCESS_TTL_SECONDS: "900",
      JWT_REFRESH_TTL_SECONDS: "2592000"
    }
    const config = {
      get: function (name: string): string | undefined {
        return settings[name]
      }
    } as any

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

  async function aPrincipal(): Promise<string> {
    const principals = dataSource.getRepository(PrincipalTypeormEntity)
    const principal = await principals.save(principals.create({ kind: "PRINCIPAL_KIND_DRIVER" }))

    return principal.id
  }

  async function stored(refreshToken: string): Promise<RefreshTokenTypeormEntity> {
    const jti = String((jwt.decode(refreshToken) as jwt.JwtPayload).jti)

    return await dataSource.getRepository(RefreshTokenTypeormEntity).findOneByOrFail({ jti })
  }

  it("stores the client a session was started by, and keeps it through a rotation", async () => {
    const pair = await tokens.issuePair(USER, await aPrincipal(), "courier-app")

    const rotated = await tokens.rotate(pair.refreshToken, USER, COURIER_APP)

    expect((await stored(pair.refreshToken)).client).toBe("courier-app")
    expect((await stored(rotated.pair.refreshToken)).client).toBe("courier-app")
    expect(rotated.bound).toBe(false)
  })

  it("binds a session that names no client to the first client that renews it", async () => {
    const pair = await tokens.issuePair(USER, await aPrincipal(), null)

    const rotated = await tokens.rotate(pair.refreshToken, USER, COURIER_APP)

    expect(rotated.bound).toBe(true)
    expect((await stored(pair.refreshToken)).client).toBeNull()
    expect((await stored(rotated.pair.refreshToken)).client).toBe("courier-app")
    await expect(tokens.rotate(rotated.pair.refreshToken, USER, UNNAMED)).rejects.toBeInstanceOf(ClientMismatchError)
  })

  it("refuses another client inside the locked rotation and leaves the token unspent", async () => {
    const pair = await tokens.issuePair(USER, await aPrincipal(), "courier-app")

    await expect(tokens.rotate(pair.refreshToken, USER, UNNAMED)).rejects.toBeInstanceOf(ClientMismatchError)

    const row = await stored(pair.refreshToken)
    expect(row.usedAt).toBeNull()
    expect(row.revokedAt).toBeNull()
    await expect(tokens.rotate(pair.refreshToken, USER, COURIER_APP)).resolves.toBeDefined()
  })

  it("binds once when two renewals race: one wins, the other is reuse and the family ends", async () => {
    const pair = await tokens.issuePair(USER, await aPrincipal(), null)

    const results = await Promise.allSettled([
      tokens.rotate(pair.refreshToken, USER, COURIER_APP),
      tokens.rotate(pair.refreshToken, USER, COURIER_APP)
    ])

    const refused = results.filter((result) => result.status === "rejected") as PromiseRejectedResult[]
    expect(refused).toHaveLength(1)
    expect(String(refused[0].reason.message)).toContain("already been used")

    const family = (await stored(pair.refreshToken)).familyId
    const live = await dataSource.getRepository(RefreshTokenTypeormEntity).findBy({ familyId: family })
    expect(live.every((row) => row.revokedAt instanceof Date)).toBe(true)
  })
})
