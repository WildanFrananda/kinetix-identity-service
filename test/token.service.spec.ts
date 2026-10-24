import { generateKeyPairSync, randomUUID } from "crypto"
import * as jwt from "jsonwebtoken"
import TokenService from "../src/application/services/token.service"
import JwtKeyProvider from "../src/infrastructure/crypto/jwt_key_provider"
import type { RequestClient } from "../src/types/client.type"
import { fakeTokenRepository as makeRepository } from "./support/fake_token_repository"

const ISSUER = "https://identity.kinetix.test"
const AUDIENCE = "kinetix"

function makeKeyPair(modulusLength = 2048): { privateKey: string; publicKey: string } {
  return generateKeyPairSync("rsa", {
    modulusLength,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" }
  })
}

function makeKeyProvider(pem?: string, previous?: string): JwtKeyProvider {
  const key = pem ?? makeKeyPair().privateKey
  const settings: Record<string, string | undefined> = {
    KINETIX_IDENTITY_JWT_PRIVATE_KEY_B64: Buffer.from(key).toString("base64"),
    KINETIX_IDENTITY_JWT_PREVIOUS_PUBLIC_KEYS_B64:
      previous === undefined ? undefined : Buffer.from(previous).toString("base64")
  }
  const config = { get: (name: string) => settings[name] } as any

  return new JwtKeyProvider(config)
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
const UNNAMED: RequestClient = { kind: "unnamed" }

describe("TokenService — minting", () => {
  it("signs with RS256 and names the key in the header", async () => {
    const { service, keys } = makeService()
    const pair = await service.issuePair(USER, PRINCIPAL, null)

    const header = JSON.parse(Buffer.from(pair.accessToken.split(".")[0], "base64url").toString())
    expect(header.alg).toBe("RS256")
    expect(header.kid).toBe(keys.kid)
  })

  it("puts the principal UUID in sub, not the account id", async () => {
    const { service } = makeService()
    const pair = await service.issuePair(USER, PRINCIPAL, null)

    const claims = jwt.decode(pair.accessToken) as jwt.JwtPayload
    expect(claims.sub).toBe(PRINCIPAL)
    expect(claims.uid).toBe(42)
  })

  it("expires the access token in fifteen minutes", async () => {
    const { service } = makeService()
    const pair = await service.issuePair(USER, PRINCIPAL, null)

    const claims = jwt.decode(pair.accessToken) as jwt.JwtPayload
    expect(pair.expiresIn).toBe(900)
    expect((claims.exp ?? 0) - (claims.iat ?? 0)).toBe(900)
  })

  it("marks the two token types apart", async () => {
    const { service } = makeService()
    const pair = await service.issuePair(USER, PRINCIPAL, null)

    expect((jwt.decode(pair.accessToken) as jwt.JwtPayload).token_use).toBe("access")
    expect((jwt.decode(pair.refreshToken) as jwt.JwtPayload).token_use).toBe("refresh")
  })

  it("names the session family in the access token, so a session can be told from the others", async () => {
    const { service } = makeService()
    const pair = await service.issuePair(USER, PRINCIPAL, null)

    const access = jwt.decode(pair.accessToken) as jwt.JwtPayload
    const refresh = jwt.decode(pair.refreshToken) as jwt.JwtPayload
    expect(access.fam).toBe(refresh.fam)
  })

  it("refuses a key that is too small for RS256", () => {
    const weak = makeKeyPair(1024).privateKey

    expect(() => makeKeyProvider(weak)).toThrow(/1024-bit/)
  })
})

describe("TokenService — a rotated signing key", () => {
  const retired = makeKeyPair()
  const older = makeKeyPair()
  const current = makeKeyPair()

  function before() {
    return makeService({}, makeKeyProvider(retired.privateKey))
  }

  function after() {
    return makeService({}, makeKeyProvider(current.privateKey, `${retired.publicKey}${older.publicKey}`))
  }

  it("publishes the signing key first, then every previous key", () => {
    const { keys } = after()
    const previous = makeKeyProvider(retired.privateKey).kid

    const published = keys.jwks().keys

    expect(published.map((key) => key.kid)).toEqual([keys.kid, previous, makeKeyProvider(older.privateKey).kid])
    expect(published.every((key) => key.use === "sig" && key.alg === "RS256" && key.kty === "RSA")).toBe(true)
    expect(published.some((key) => "d" in key)).toBe(false)
  })

  it("signs new tokens with the current key only", async () => {
    const { service, keys } = after()
    const pair = await service.issuePair(USER, PRINCIPAL, null)

    expect(jwt.decode(pair.accessToken, { complete: true })?.header.kid).toBe(keys.kid)
    expect(jwt.decode(pair.refreshToken, { complete: true })?.header.kid).toBe(keys.kid)
  })

  it("still accepts a token the previous key signed", async () => {
    const pair = await before().service.issuePair(USER, PRINCIPAL, null)

    const claims = await after().service.verifyAccess(pair.accessToken)

    expect(claims.sub).toBe(PRINCIPAL)
  })

  it("rejects a token signed by a key it no longer publishes", async () => {
    const pair = await before().service.issuePair(USER, PRINCIPAL, null)
    const { service } = makeService({}, makeKeyProvider(current.privateKey, older.publicKey))

    await expect(service.verifyAccess(pair.accessToken)).rejects.toThrow("Invalid token")
  })

  it("rejects a token that names a published key but was signed by another", async () => {
    const { service, keys } = after()
    const claims = {
      sub: PRINCIPAL,
      jti: randomUUID(),
      token_use: "access",
      uid: 42
    }
    const forged = jwt.sign(claims, makeKeyPair().privateKey, {
      algorithm: "RS256",
      keyid: keys.kid,
      issuer: ISSUER,
      audience: AUDIENCE,
      expiresIn: 900
    })

    await expect(service.verifyAccess(forged)).rejects.toThrow("Invalid token")
  })

  it("rejects a token that names no key", async () => {
    const { service } = after()
    const claims = {
      sub: PRINCIPAL,
      jti: randomUUID(),
      token_use: "access",
      uid: 42
    }
    const unnamed = jwt.sign(claims, current.privateKey, {
      algorithm: "RS256",
      issuer: ISSUER,
      audience: AUDIENCE,
      expiresIn: 900
    })

    await expect(service.verifyAccess(unnamed)).rejects.toThrow("Invalid token")
  })

  it("refuses to start when a previous key is the signing key", () => {
    expect(() => makeKeyProvider(current.privateKey, current.publicKey)).toThrow(/is the current one/)
  })

  it("refuses to start when the previous keys hold no public key", () => {
    expect(() => makeKeyProvider(current.privateKey, retired.privateKey)).toThrow(/holds no PEM public key/)
  })

  it("refuses to start when a previous key is too small", () => {
    expect(() => makeKeyProvider(current.privateKey, makeKeyPair(1024).publicKey)).toThrow(/at least 2048 bits/)
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

    const pair = await minter.issuePair(USER, PRINCIPAL, null)
    await expect(verifier.verifyAccess(pair.accessToken)).rejects.toThrow("Invalid token")
  })

  it("rejects a token minted by a different issuer", async () => {
    const keys = makeKeyProvider()
    const { service: minter } = makeService({ JWT_ISSUER: "https://identity.staging.kinetix.test" }, keys)
    const { service: verifier } = makeService({}, keys)

    const pair = await minter.issuePair(USER, PRINCIPAL, null)
    await expect(verifier.verifyAccess(pair.accessToken)).rejects.toThrow("Invalid token")
  })

  it("rejects an expired access token", async () => {
    const { service } = makeService({ JWT_ACCESS_TTL_SECONDS: "1" })
    const pair = await service.issuePair(USER, PRINCIPAL, null)

    jest.useFakeTimers().setSystemTime(Date.now() + 5000)
    try {
      await expect(service.verifyAccess(pair.accessToken)).rejects.toThrow("Invalid token")
    } finally {
      jest.useRealTimers()
    }
  })

  it("refuses a refresh token presented as an access token", async () => {
    const { service } = makeService()
    const pair = await service.issuePair(USER, PRINCIPAL, null)

    await expect(service.verifyAccess(pair.refreshToken)).rejects.toThrow("This is not an access token")
  })

  it("refuses an access token presented as a refresh token", async () => {
    const { service } = makeService()
    const pair = await service.issuePair(USER, PRINCIPAL, null)

    await expect(service.rotate(pair.accessToken, USER, UNNAMED)).rejects.toThrow("This is not a refresh token")
  })
})

describe("TokenService — rotation", () => {
  it("issues a new pair and keeps the family", async () => {
    const { service } = makeService()
    const first = await service.issuePair(USER, PRINCIPAL, null)
    const second = (await service.rotate(first.refreshToken, USER, UNNAMED)).pair

    expect(second.accessToken).not.toBe(first.accessToken)
    expect(second.refreshToken).not.toBe(first.refreshToken)

    const before = jwt.decode(first.refreshToken) as jwt.JwtPayload
    const after = jwt.decode(second.refreshToken) as jwt.JwtPayload
    expect(after.fam).toBe(before.fam)
  })

  it("marks the spent token used and links it to its replacement", async () => {
    const { service, refreshRepo } = makeService()
    const first = await service.issuePair(USER, PRINCIPAL, null)
    const second = (await service.rotate(first.refreshToken, USER, UNNAMED)).pair

    const oldJti = (jwt.decode(first.refreshToken) as jwt.JwtPayload).jti
    const newJti = (jwt.decode(second.refreshToken) as jwt.JwtPayload).jti
    const spent = refreshRepo.rows.find((r) => r.jti === oldJti)

    expect(spent.usedAt).toBeInstanceOf(Date)
    expect(spent.replacedByJti).toBe(newJti)
  })

  it("revokes the whole family when a spent refresh token is presented again", async () => {
    const { service, refreshRepo } = makeService()
    const first = await service.issuePair(USER, PRINCIPAL, null)
    const second = (await service.rotate(first.refreshToken, USER, UNNAMED)).pair

    await expect(service.rotate(first.refreshToken, USER, UNNAMED)).rejects.toThrow("already been used")

    expect(refreshRepo.rows.length).toBe(2)
    for (const row of refreshRepo.rows) {
      expect(row.revokedAt).toBeInstanceOf(Date)
      expect(row.revokedReason).toBe("rotation_reuse")
    }

    await expect(service.rotate(second.refreshToken, USER, UNNAMED)).rejects.toThrow("revoked")
  })

  it("refuses a correctly signed refresh token this service never issued", async () => {
    const { service, keys } = makeService()
    const orphan = jwt.sign(
      { sub: PRINCIPAL, jti: randomUUID(), token_use: "refresh", fam: randomUUID(), uid: 42 },
      keys.privateKey,
      { algorithm: "RS256", keyid: keys.kid, issuer: ISSUER, audience: AUDIENCE, expiresIn: 3600 }
    )

    await expect(service.rotate(orphan, USER, UNNAMED)).rejects.toThrow("not recognised")
  })
})

describe("TokenService — revocation", () => {
  it("stops accepting an access token after logout", async () => {
    const { service } = makeService()
    const pair = await service.issuePair(USER, PRINCIPAL, null)

    const claims = await service.verifyAccess(pair.accessToken)
    await service.logout(claims, (jwt.decode(pair.refreshToken) as jwt.JwtPayload).fam)

    await expect(service.verifyAccess(pair.accessToken)).rejects.toThrow("revoked")
  })

  it("stops the family rotating after logout", async () => {
    const { service } = makeService()
    const pair = await service.issuePair(USER, PRINCIPAL, null)

    const claims = await service.verifyAccess(pair.accessToken)
    await service.logout(claims, (jwt.decode(pair.refreshToken) as jwt.JwtPayload).fam)

    await expect(service.rotate(pair.refreshToken, USER, UNNAMED)).rejects.toThrow("revoked")
  })

  it("treats a second logout of the same token as success, not an error", async () => {
    const { service } = makeService()
    const pair = await service.issuePair(USER, PRINCIPAL, null)
    const claims = await service.verifyAccess(pair.accessToken)

    await service.logout(claims)
    await expect(service.logout(claims)).resolves.toBeUndefined()
  })

  it("fails the logout when the revocation could not be written", async () => {
    const { service, revokedRepo } = makeService()
    const pair = await service.issuePair(USER, PRINCIPAL, null)
    const claims = await service.verifyAccess(pair.accessToken)
    revokedRepo.insert.mockRejectedValueOnce(new Error("connection terminated unexpectedly"))

    await expect(service.logout(claims)).rejects.toThrow("connection terminated")
  })

  it("ends every other session of the principal and keeps the one named", async () => {
    const { service, refreshRepo } = makeService()
    const current = await service.issuePair(USER, PRINCIPAL, null)
    const other = await service.issuePair(USER, PRINCIPAL, null)
    const stranger = await service.issuePair(USER, "ffffffff-bbbb-cccc-dddd-eeeeeeeeeeee", null)
    const currentFamily = String((jwt.decode(current.accessToken) as jwt.JwtPayload).fam)

    await service.revokeOtherSessions(PRINCIPAL, currentFamily, "two_factor_enabled")

    await expect(service.rotate(other.refreshToken, USER, UNNAMED)).rejects.toThrow("revoked")
    await expect(service.rotate(current.refreshToken, USER, UNNAMED)).resolves.toBeDefined()
    await expect(service.rotate(stranger.refreshToken, USER, UNNAMED)).resolves.toBeDefined()
    expect(refreshRepo.rows.filter((row) => row.revokedReason === "two_factor_enabled")).toHaveLength(1)
  })

  it("ends every session when the caller's token names no session", async () => {
    const { service } = makeService()
    const first = await service.issuePair(USER, PRINCIPAL, null)
    const second = await service.issuePair(USER, PRINCIPAL, null)

    await service.revokeOtherSessions(PRINCIPAL, undefined, "two_factor_disabled")

    await expect(service.rotate(first.refreshToken, USER, UNNAMED)).rejects.toThrow("revoked")
    await expect(service.rotate(second.refreshToken, USER, UNNAMED)).rejects.toThrow("revoked")
  })
})

describe("TokenService — a two-factor challenge", () => {
  it("is answered once and refused the second time", async () => {
    const { service } = makeService()
    const challenge = service.issueMfaChallenge(USER, PRINCIPAL)
    const claims = service.peekMfaChallenge(challenge.token)

    await expect(service.consumeMfaChallenge(claims)).resolves.toBeUndefined()
    await expect(service.consumeMfaChallenge(claims)).rejects.toThrow("already been answered")
  })

  it("is not taken for answered when the record could not be written", async () => {
    const { service, revokedRepo } = makeService()
    const claims = service.peekMfaChallenge(service.issueMfaChallenge(USER, PRINCIPAL).token)
    revokedRepo.insert.mockRejectedValueOnce(new Error("connection terminated unexpectedly"))

    await expect(service.consumeMfaChallenge(claims)).rejects.toThrow("connection terminated")
  })
})

describe("TokenService — configuration", () => {
  it("refuses to start without an issuer", () => {
    expect(() => makeService({ JWT_ISSUER: "" })).toThrow(/JWT_ISSUER/)
  })

  it("refuses to start without an audience", () => {
    expect(() => makeService({ JWT_AUDIENCE: "" })).toThrow(/JWT_AUDIENCE/)
  })

  it.each(["JWT_ACCESS_TTL_SECONDS", "JWT_REFRESH_TTL_SECONDS"])(
    "refuses to start without %s rather than assuming a lifetime",
    (name) => {
      expect(() => makeService({ [name]: "" })).toThrow(new RegExp(`${name} is required`))
    }
  )

  it("refuses a refresh lifetime that is not longer than the access lifetime", () => {
    expect(() => makeService({ JWT_REFRESH_TTL_SECONDS: "60" })).toThrow(/greater than the access TTL/)
  })
})
