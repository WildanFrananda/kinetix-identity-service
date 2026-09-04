import { generateKeyPairSync, randomUUID } from "crypto"
import * as jwt from "jsonwebtoken"
import TokenService from "../src/application/services/token.service"
import JwtKeyProvider from "../src/infrastructure/crypto/jwt_key_provider"

const ISSUER = "https://identity.kinetix.test"
const AUDIENCE = "kinetix"

function makeKeyProvider(pem?: string): JwtKeyProvider {
  const key =
    pem ??
    generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" }
    }).privateKey

  const config = {
    get: (name: string) =>
      name === "KINETIX_IDENTITY_JWT_PRIVATE_KEY_B64" ? Buffer.from(key).toString("base64") : undefined
  } as any

  return new JwtKeyProvider(config)
}

function makeRepository<T extends Record<string, any>>() {
  const rows: T[] = []
  return {
    rows,
    create: (data: T) => ({ ...data }) as T,
    save: jest.fn(async (row: T) => {
      const existing = rows.find((r) => r.jti === row.jti)
      if (existing) {
        Object.assign(existing, row)
        return existing
      }
      rows.push(row)
      return row
    }),
    findOne: jest.fn(async ({ where }: { where: Record<string, any> }) => {
      return rows.find((r) => Object.entries(where).every(([k, v]) => r[k] === v)) ?? null
    }),
    update: jest.fn(async (where: Record<string, any>, patch: Record<string, any>) => {
      let affected = 0
      for (const row of rows) {
        const matches = Object.entries(where).every(([k, v]) => {
          if (v && typeof v === "object" && typeof v.type === "string") {
            return v.type === "isNull" ? row[k] === null || row[k] === undefined : true
          }
          return row[k] === v
        })
        if (matches) {
          Object.assign(row, patch)
          affected += 1
        }
      }
      return { affected }
    }),
    delete: jest.fn(async () => ({ affected: 0 }))
  }
}

function makeService(overrides: Record<string, string> = {}, keyProvider?: JwtKeyProvider) {
  const settings: Record<string, string> = {
    JWT_ISSUER: ISSUER,
    JWT_AUDIENCE: AUDIENCE,
    JWT_ACCESS_TTL_SECONDS: "900",
    JWT_REFRESH_TTL_SECONDS: "2592000",
    ...overrides
  }
  const config = { get: (name: string) => settings[name] } as any
  const refreshRepo = makeRepository<any>()
  const revokedRepo = makeRepository<any>()
  const keys = keyProvider ?? makeKeyProvider()
  const service = new TokenService(config, keys, refreshRepo as any, revokedRepo as any)
  return { service, refreshRepo, revokedRepo, keys }
}

const USER = { id: 42, email: "user@kinetix.test", role: "customer" }
const PRINCIPAL = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"

describe("TokenService — minting", () => {
  it("signs with RS256 and names the key in the header", async () => {
    const { service, keys } = makeService()
    const pair = await service.issuePair(USER, PRINCIPAL)

    const header = JSON.parse(Buffer.from(pair.accessToken.split(".")[0], "base64url").toString())
    expect(header.alg).toBe("RS256")
    expect(header.kid).toBe(keys.kid)
  })

  it("puts the principal UUID in sub, not the account id", async () => {
    const { service } = makeService()
    const pair = await service.issuePair(USER, PRINCIPAL)

    const claims = jwt.decode(pair.accessToken) as jwt.JwtPayload
    expect(claims.sub).toBe(PRINCIPAL)
    expect(claims.uid).toBe(42)
  })

  it("expires the access token in fifteen minutes", async () => {
    const { service } = makeService()
    const pair = await service.issuePair(USER, PRINCIPAL)

    const claims = jwt.decode(pair.accessToken) as jwt.JwtPayload
    expect(pair.expiresIn).toBe(900)
    expect((claims.exp ?? 0) - (claims.iat ?? 0)).toBe(900)
  })

  it("marks the two token types apart", async () => {
    const { service } = makeService()
    const pair = await service.issuePair(USER, PRINCIPAL)

    expect((jwt.decode(pair.accessToken) as jwt.JwtPayload).token_use).toBe("access")
    expect((jwt.decode(pair.refreshToken) as jwt.JwtPayload).token_use).toBe("refresh")
  })

  it("refuses a key that is too small for RS256", () => {
    const weak = generateKeyPairSync("rsa", {
      modulusLength: 1024,
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" }
    }).privateKey

    expect(() => makeKeyProvider(weak)).toThrow(/1024-bit/)
  })
})

describe("TokenService — tokens that must be rejected", () => {
  it("rejects alg:none", async () => {
    const { service } = makeService()
    const claims = {
      sub: PRINCIPAL,
      jti: randomUUID(),
      iss: ISSUER,
      aud: AUDIENCE,
      token_use: "access",
      uid: 42,
      exp: Math.floor(Date.now() / 1000) + 900
    }
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url")
    const body = Buffer.from(JSON.stringify(claims)).toString("base64url")
    const forged = `${header}.${body}.`

    await expect(service.verifyAccess(forged)).rejects.toThrow("Invalid token")
  })

  it("rejects HS256 even when the attacker guesses a secret", async () => {
    const { service } = makeService()
    const forged = jwt.sign(
      { sub: PRINCIPAL, jti: randomUUID(), token_use: "access", uid: 42 },
      "the-old-shared-symmetric-secret-that-eight-services-held",
      { algorithm: "HS256", issuer: ISSUER, audience: AUDIENCE, expiresIn: 900 }
    )

    await expect(service.verifyAccess(forged)).rejects.toThrow("Invalid token")
  })

  it("rejects PS256, which the same RSA key would otherwise verify", async () => {
    const { service, keys } = makeService()
    const forged = jwt.sign(
      { sub: PRINCIPAL, jti: randomUUID(), token_use: "access", uid: 42 },
      keys.privateKey,
      { algorithm: "PS256", issuer: ISSUER, audience: AUDIENCE, expiresIn: 900 }
    )

    await expect(service.verifyAccess(forged)).rejects.toThrow("Invalid token")
  })

  it("rejects RS512, for the same reason", async () => {
    const { service, keys } = makeService()
    const forged = jwt.sign(
      { sub: PRINCIPAL, jti: randomUUID(), token_use: "access", uid: 42 },
      keys.privateKey,
      { algorithm: "RS512", issuer: ISSUER, audience: AUDIENCE, expiresIn: 900 }
    )

    await expect(service.verifyAccess(forged)).rejects.toThrow("Invalid token")
  })

  it("rejects a token signed by a different RSA key", async () => {
    const { service } = makeService()
    const other = makeKeyProvider()
    const forged = jwt.sign(
      { sub: PRINCIPAL, jti: randomUUID(), token_use: "access", uid: 42 },
      other.privateKey,
      { algorithm: "RS256", issuer: ISSUER, audience: AUDIENCE, expiresIn: 900 }
    )

    await expect(service.verifyAccess(forged)).rejects.toThrow("Invalid token")
  })

  it("rejects a token minted for a different audience", async () => {
    const keys = makeKeyProvider()
    const { service: minter } = makeService({ JWT_AUDIENCE: "some-other-platform" }, keys)
    const { service: verifier } = makeService({}, keys)

    const pair = await minter.issuePair(USER, PRINCIPAL)
    await expect(verifier.verifyAccess(pair.accessToken)).rejects.toThrow("Invalid token")
  })

  it("rejects a token minted by a different issuer", async () => {
    const keys = makeKeyProvider()
    const { service: minter } = makeService({ JWT_ISSUER: "https://identity.staging.kinetix.test" }, keys)
    const { service: verifier } = makeService({}, keys)

    const pair = await minter.issuePair(USER, PRINCIPAL)
    await expect(verifier.verifyAccess(pair.accessToken)).rejects.toThrow("Invalid token")
  })

  it("rejects an expired access token", async () => {
    const { service } = makeService({ JWT_ACCESS_TTL_SECONDS: "1" })
    const pair = await service.issuePair(USER, PRINCIPAL)

    jest.useFakeTimers().setSystemTime(Date.now() + 5000)
    try {
      await expect(service.verifyAccess(pair.accessToken)).rejects.toThrow("Invalid token")
    } finally {
      jest.useRealTimers()
    }
  })

  it("refuses a refresh token presented as an access token", async () => {
    const { service } = makeService()
    const pair = await service.issuePair(USER, PRINCIPAL)

    await expect(service.verifyAccess(pair.refreshToken)).rejects.toThrow("This is not an access token")
  })

  it("refuses an access token presented as a refresh token", async () => {
    const { service } = makeService()
    const pair = await service.issuePair(USER, PRINCIPAL)

    await expect(service.rotate(pair.accessToken, USER)).rejects.toThrow("This is not a refresh token")
  })
})

describe("TokenService — rotation", () => {
  it("issues a new pair and keeps the family", async () => {
    const { service } = makeService()
    const first = await service.issuePair(USER, PRINCIPAL)
    const second = await service.rotate(first.refreshToken, USER)

    expect(second.accessToken).not.toBe(first.accessToken)
    expect(second.refreshToken).not.toBe(first.refreshToken)

    const before = jwt.decode(first.refreshToken) as jwt.JwtPayload
    const after = jwt.decode(second.refreshToken) as jwt.JwtPayload
    expect(after.fam).toBe(before.fam)
  })

  it("marks the spent token used and links it to its replacement", async () => {
    const { service, refreshRepo } = makeService()
    const first = await service.issuePair(USER, PRINCIPAL)
    const second = await service.rotate(first.refreshToken, USER)

    const oldJti = (jwt.decode(first.refreshToken) as jwt.JwtPayload).jti
    const newJti = (jwt.decode(second.refreshToken) as jwt.JwtPayload).jti
    const spent = refreshRepo.rows.find((r) => r.jti === oldJti)

    expect(spent.usedAt).toBeInstanceOf(Date)
    expect(spent.replacedByJti).toBe(newJti)
  })

  it("revokes the whole family when a spent refresh token is presented again", async () => {
    const { service, refreshRepo } = makeService()
    const first = await service.issuePair(USER, PRINCIPAL)
    const second = await service.rotate(first.refreshToken, USER)

    await expect(service.rotate(first.refreshToken, USER)).rejects.toThrow("already been used")

    expect(refreshRepo.rows.length).toBe(2)
    for (const row of refreshRepo.rows) {
      expect(row.revokedAt).toBeInstanceOf(Date)
      expect(row.revokedReason).toBe("rotation_reuse")
    }

    await expect(service.rotate(second.refreshToken, USER)).rejects.toThrow("revoked")
  })

  it("refuses a correctly signed refresh token this service never issued", async () => {
    const { service, keys } = makeService()
    const orphan = jwt.sign(
      { sub: PRINCIPAL, jti: randomUUID(), token_use: "refresh", fam: randomUUID(), uid: 42 },
      keys.privateKey,
      { algorithm: "RS256", issuer: ISSUER, audience: AUDIENCE, expiresIn: 3600 }
    )

    await expect(service.rotate(orphan, USER)).rejects.toThrow("not recognised")
  })
})

describe("TokenService — revocation", () => {
  it("stops accepting an access token after logout", async () => {
    const { service } = makeService()
    const pair = await service.issuePair(USER, PRINCIPAL)

    const claims = await service.verifyAccess(pair.accessToken)
    await service.logout(claims, (jwt.decode(pair.refreshToken) as jwt.JwtPayload).fam)

    await expect(service.verifyAccess(pair.accessToken)).rejects.toThrow("revoked")
  })

  it("stops the family rotating after logout", async () => {
    const { service } = makeService()
    const pair = await service.issuePair(USER, PRINCIPAL)

    const claims = await service.verifyAccess(pair.accessToken)
    await service.logout(claims, (jwt.decode(pair.refreshToken) as jwt.JwtPayload).fam)

    await expect(service.rotate(pair.refreshToken, USER)).rejects.toThrow("revoked")
  })

  it("treats a second logout of the same token as success, not an error", async () => {
    const { service } = makeService()
    const pair = await service.issuePair(USER, PRINCIPAL)
    const claims = await service.verifyAccess(pair.accessToken)

    await service.logout(claims)
    await expect(service.logout(claims)).resolves.toBeUndefined()
  })
})

describe("TokenService — configuration", () => {
  it("refuses to start without an issuer", () => {
    expect(() => makeService({ JWT_ISSUER: "" })).toThrow(/JWT_ISSUER/)
  })

  it("refuses to start without an audience", () => {
    expect(() => makeService({ JWT_AUDIENCE: "" })).toThrow(/JWT_AUDIENCE/)
  })

  it("refuses a refresh lifetime that is not longer than the access lifetime", () => {
    expect(() => makeService({ JWT_REFRESH_TTL_SECONDS: "60" })).toThrow(/greater than the access TTL/)
  })
})
