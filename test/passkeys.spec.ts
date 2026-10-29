import { randomBytes } from "crypto"
import * as bcrypt from "bcrypt"
import * as jwt from "jsonwebtoken"
import { Logger } from "@nestjs/common"
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON
} from "@simplewebauthn/server"
import type { InjectOptions, LightMyRequestResponse } from "fastify"
import UserEntity from "../src/domain/entities/user.entity"
import { accountKeyOf } from "../src/infrastructure/crypto/account_key"
import { codeAt } from "../src/infrastructure/crypto/totp"
import { metricsRegistry } from "../src/infrastructure/observability/metrics_registry"
import { GATEWAY_ADDRESS } from "./support/http_app"
import { identityApp, principalOf } from "./support/identity_app"
import { LAB_RELYING_PARTY } from "./support/lab_relying_party"
import SoftwareAuthenticator from "./support/software_authenticator"

const PASSWORD = "passkey-fixture-password"

const SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP"

const ADMIN_ID = 1

const OTHER_ID = 2

const PLAIN_ID = 3

const ORIGIN = LAB_RELYING_PARTY.origin

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u

const VIEW_KEYS = ["backedUp", "createdAt", "deviceType", "id", "lastUsedAt", "name"]

type LoggedEvent = { message: string; requestId?: string | null; fields?: Record<string, unknown> }

let addressCounter = 0

function freshAddress(): string {
  addressCounter += 1
  return `192.0.2.${addressCounter % 250}`
}

async function failuresCounted(stage: string, role: string): Promise<number> {
  const metric = await metricsRegistry.getSingleMetric("kinetix_identity_sign_in_failures_total")?.get()
  const sample = metric?.values.find((value) => value.labels.stage === stage && value.labels.role === role)

  return sample?.value ?? 0
}

describe("passkeys", () => {
  let harness: Awaited<ReturnType<typeof identityApp>>
  let admin: UserEntity
  let other: UserEntity
  let plain: UserEntity

  async function send(options: InjectOptions): Promise<LightMyRequestResponse> {
    return await harness.app.getHttpAdapter().getInstance().inject({
      remoteAddress: GATEWAY_ADDRESS,
      ...options,
      headers: { "x-forwarded-for": freshAddress(), ...(options.headers ?? {}) }
    })
  }

  function bearer(token: string): Record<string, string> {
    return { authorization: `Bearer ${token}` }
  }

  async function sessionOf(user: UserEntity): Promise<string> {
    const pair = await harness.tokens.issuePair(
      { id: user.id, email: user.email, role: user.role },
      principalOf(user.id),
      null
    )

    return pair.accessToken
  }

  async function creationOptions(user: UserEntity, token: string): Promise<LightMyRequestResponse> {
    return await send({ method: "POST", url: `/api/v1/auth/passkeys/${user.id}/options`, headers: bearer(token) })
  }

  async function register(
    user: UserEntity,
    token: string,
    payload: Record<string, unknown>
  ): Promise<LightMyRequestResponse> {
    harness.attempts.advance(120)

    return await send({ method: "POST", url: `/api/v1/auth/passkeys/${user.id}`, headers: bearer(token), payload })
  }

  async function enrol(
    user: UserEntity,
    authenticator: SoftwareAuthenticator,
    name: string = "Work laptop"
  ): Promise<LightMyRequestResponse> {
    const token = await sessionOf(user)
    const options = await creationOptions(user, token)
    expect(options.statusCode).toBe(200)

    return await register(user, token, {
      challengeId: options.json().challengeId,
      name,
      password: PASSWORD,
      credential: authenticator.register(options.json().options, ORIGIN)
    })
  }

  async function list(user: UserEntity, token: string): Promise<LightMyRequestResponse> {
    return await send({ method: "GET", url: `/api/v1/auth/passkeys/${user.id}`, headers: bearer(token) })
  }

  async function remove(
    user: UserEntity,
    token: string,
    passkeyId: string,
    payload: Record<string, unknown>
  ): Promise<LightMyRequestResponse> {
    harness.attempts.advance(120)

    return await send({
      method: "DELETE",
      url: `/api/v1/auth/passkeys/${user.id}/${passkeyId}`,
      headers: bearer(token),
      payload
    })
  }

  async function login(user: UserEntity, headers: Record<string, string> = {}): Promise<LightMyRequestResponse> {
    harness.attempts.advance(120)

    return await send({
      method: "POST",
      url: "/api/v1/auth/login",
      headers,
      payload: { email: user.email, password: PASSWORD }
    })
  }

  async function challengeFor(user: UserEntity, headers: Record<string, string> = {}): Promise<string> {
    const response = await login(user, headers)
    expect(response.json().mfaRequired).toBe(true)

    return response.json().challengeToken
  }

  async function requestOptions(
    challengeToken: string,
    headers: Record<string, string> = {}
  ): Promise<LightMyRequestResponse> {
    return await send({ method: "POST", url: "/api/v1/auth/2fa/passkey/options", headers, payload: { challengeToken } })
  }

  async function answer(
    challengeToken: string,
    credential: unknown,
    headers: Record<string, string> = {}
  ): Promise<LightMyRequestResponse> {
    harness.attempts.advance(120)

    return await send({
      method: "POST",
      url: "/api/v1/auth/2fa/passkey/verify",
      headers,
      payload: { challengeToken, credential }
    })
  }

  async function signInOptions(challengeToken: string): Promise<PublicKeyCredentialRequestOptionsJSON> {
    const response = await requestOptions(challengeToken)
    expect(response.statusCode).toBe(200)

    return response.json().options
  }

  async function signInWith(authenticator: SoftwareAuthenticator, challengeToken: string): Promise<LightMyRequestResponse> {
    const options = await signInOptions(challengeToken)

    return await answer(challengeToken, authenticator.assert(options, ORIGIN))
  }

  async function answerWithCode(challengeToken: string): Promise<LightMyRequestResponse> {
    harness.attempts.advance(120)

    return await send({
      method: "POST",
      url: "/api/v1/auth/2fa/verify",
      payload: { challengeToken, code: codeAt(SECRET, Math.floor(Date.now() / 1000 / 30) + 1) }
    })
  }

  async function seedPasskeys(user: UserEntity, count: number): Promise<void> {
    for (let seeded = 0; seeded < count; seeded++) {
      await harness.passkeys.add(
        {
          userId: user.id,
          credentialId: randomBytes(16).toString("base64url"),
          publicKey: new Uint8Array(65),
          signCount: 0,
          transports: ["usb"],
          deviceType: "singleDevice",
          backedUp: false,
          name: `Seeded ${seeded}`
        },
        Number.MAX_SAFE_INTEGER
      )
    }
  }

  function jtiOf(token: string): string {
    return String((jwt.decode(token) as jwt.JwtPayload).jti)
  }

  function warnings(log: jest.SpyInstance): LoggedEvent[] {
    return log.mock.calls
      .map((call) => call[0] as LoggedEvent)
      .filter((event) => event.message === "sign_in_failure")
  }

  beforeEach(async () => {
    harness = await identityApp()
    const passwordHash = await bcrypt.hash(PASSWORD, 4)
    admin = harness.users.add(
      new UserEntity(ADMIN_ID, "admin@kinetix.test", passwordHash, "admin", true, new Date(), new Date(), SECRET)
    )

    other = harness.users.add(
      new UserEntity(OTHER_ID, "other@kinetix.test", passwordHash, "customer", true, new Date(), new Date(), SECRET)
    )

    plain = harness.users.add(new UserEntity(PLAIN_ID, "plain@kinetix.test", passwordHash, "customer"))
  })

  afterEach(async () => {
    jest.restoreAllMocks()
    await harness.app.close()
  })

  describe("enrolling one", () => {
    it("answers creation options: attestation none, a resident key preferred, user verification required, ES256 and RS256, 300 s", async () => {
      const response = await creationOptions(admin, await sessionOf(admin))

      expect(response.statusCode).toBe(200)
      expect(response.json().challengeId).toMatch(UUID)

      const options: PublicKeyCredentialCreationOptionsJSON = response.json().options
      expect(options.attestation).toBe("none")
      expect(options.authenticatorSelection?.residentKey).toBe("preferred")
      expect(options.authenticatorSelection?.userVerification).toBe("required")
      expect(options.pubKeyCredParams.map((parameter) => parameter.alg)).toEqual([-7, -257])
      expect(options.timeout).toBe(300_000)
      expect(options.rp).toEqual({ id: "backoffice.localhost", name: "Kinetix Backoffice" })
      expect(options.user.name).toBe(admin.email)
      expect(options.excludeCredentials).toEqual([])
    })

    it("gives the authenticator an opaque, stable user handle, never the email", async () => {
      const first = await creationOptions(admin, await sessionOf(admin))
      const second = await creationOptions(admin, await sessionOf(admin))

      const handle = Buffer.from(first.json().options.user.id, "base64url").toString("utf8")
      expect(handle).toBe(principalOf(ADMIN_ID))
      expect(handle).not.toContain("@")
      expect(second.json().options.user.id).toBe(first.json().options.user.id)
    })

    it("adds an ES256 passkey and answers 201 with it, without its key", async () => {
      const response = await enrol(admin, new SoftwareAuthenticator(), "  YubiKey  ")

      expect(response.statusCode).toBe(201)
      const body = response.json()
      expect(Object.keys(body).sort()).toEqual(VIEW_KEYS)
      expect(body.id).toMatch(UUID)
      expect(body.name).toBe("YubiKey")
      expect(body.lastUsedAt).toBeNull()
      expect(body.deviceType).toBe("singleDevice")
      expect(body.backedUp).toBe(false)
      expect(new Date(body.createdAt).toISOString()).toBe(body.createdAt)
      expect(harness.passkeys.rows).toHaveLength(1)
      expect(harness.passkeys.rows[0].transports).toEqual(["internal"])
    })

    it("adds an RS256 passkey, and records a synced one as multi-device and backed up", async () => {
      const rsa = await enrol(admin, new SoftwareAuthenticator({ algorithm: "RS256" }))
      const synced = await enrol(admin, new SoftwareAuthenticator({ backedUp: true }))

      expect(rsa.statusCode).toBe(201)
      expect(synced.statusCode).toBe(201)
      expect(synced.json().deviceType).toBe("multiDevice")
      expect(synced.json().backedUp).toBe(true)
    })

    it("names the account's own passkeys in excludeCredentials, so one authenticator is not added twice", async () => {
      const authenticator = new SoftwareAuthenticator()
      await enrol(admin, authenticator)

      const response = await creationOptions(admin, await sessionOf(admin))

      expect(response.json().options.excludeCredentials).toEqual([
        { id: authenticator.id, transports: ["internal"], type: "public-key" }
      ])
    })

    it("refuses an account whose authenticator code is off with 409 TWO_FACTOR_REQUIRED", async () => {
      const token = await sessionOf(plain)

      const options = await creationOptions(plain, token)
      const registration = await register(plain, token, {
        challengeId: "00000000-0000-4000-8000-000000000000",
        name: "Phone",
        password: PASSWORD,
        credential: {}
      })

      expect(options.statusCode).toBe(409)
      expect(options.json().error).toBe("TWO_FACTOR_REQUIRED")
      expect(registration.statusCode).toBe(409)
      expect(registration.json().error).toBe("TWO_FACTOR_REQUIRED")
    })

    it("refuses a wrong password exactly as sign-in does, counts it, and leaves the challenge usable", async () => {
      const before = await failuresCounted("password", "admin")
      const authenticator = new SoftwareAuthenticator()
      const token = await sessionOf(admin)
      const options = await creationOptions(admin, token)
      const payload = {
        challengeId: options.json().challengeId,
        name: "Phone",
        credential: authenticator.register(options.json().options, ORIGIN)
      }

      const wrong = await register(admin, token, { ...payload, password: "not-the-password" })
      const right = await register(admin, token, { ...payload, password: PASSWORD })

      expect(wrong.statusCode).toBe(401)
      expect(wrong.json().message).toBe("Invalid email or password credentials")
      expect(await failuresCounted("password", "admin")).toBe(before + 1)
      expect(right.statusCode).toBe(201)
    })

    it("refuses a missing password with 400 before anything is counted", async () => {
      const token = await sessionOf(admin)
      const options = await creationOptions(admin, token)

      const response = await register(admin, token, {
        challengeId: options.json().challengeId,
        name: "Phone",
        credential: new SoftwareAuthenticator().register(options.json().options, ORIGIN)
      })

      expect(response.statusCode).toBe(400)
      expect(harness.attempts.accounts.get(accountKeyOf(admin.email))).toBeUndefined()
    })

    it.each([
      ["a credential that is not an object", { credential: "x" }],
      ["a blank name", { name: "   " }],
      ["a name longer than 64 characters", { name: "n".repeat(65) }],
      ["a challenge id that is not a UUID", { challengeId: "abc" }],
      ["an unknown field", { role: "admin" }]
    ])("refuses %s with 400", async (_label, change) => {
      const token = await sessionOf(admin)
      const options = await creationOptions(admin, token)

      const response = await register(admin, token, {
        challengeId: options.json().challengeId,
        name: "Phone",
        password: PASSWORD,
        credential: new SoftwareAuthenticator().register(options.json().options, ORIGIN),
        ...change
      })

      expect(response.statusCode).toBe(400)
      expect(harness.passkeys.rows).toHaveLength(0)
    })

    it("spends the challenge once", async () => {
      const token = await sessionOf(admin)
      const options = await creationOptions(admin, token)
      const challengeId = options.json().challengeId

      const first = await register(admin, token, {
        challengeId,
        name: "First",
        password: PASSWORD,
        credential: new SoftwareAuthenticator().register(options.json().options, ORIGIN)
      })

      const second = await register(admin, token, {
        challengeId,
        name: "Second",
        password: PASSWORD,
        credential: new SoftwareAuthenticator().register(options.json().options, ORIGIN)
      })

      expect(first.statusCode).toBe(201)
      expect(second.statusCode).toBe(400)
      expect(second.json().error).toBe("PASSKEY_CHALLENGE_INVALID")
      expect(harness.passkeys.rows).toHaveLength(1)
    })

    it("refuses a challenge older than 300 s", async () => {
      const token = await sessionOf(admin)
      const options = await creationOptions(admin, token)
      harness.passkeyChallenges.advance(301)

      const response = await register(admin, token, {
        challengeId: options.json().challengeId,
        name: "Late",
        password: PASSWORD,
        credential: new SoftwareAuthenticator().register(options.json().options, ORIGIN)
      })

      expect(response.statusCode).toBe(400)
      expect(response.json().error).toBe("PASSKEY_CHALLENGE_INVALID")
    })

    it("refuses another account's challenge", async () => {
      const options = await creationOptions(other, await sessionOf(other))

      const response = await register(admin, await sessionOf(admin), {
        challengeId: options.json().challengeId,
        name: "Borrowed",
        password: PASSWORD,
        credential: new SoftwareAuthenticator().register(options.json().options, ORIGIN)
      })

      expect(response.statusCode).toBe(400)
      expect(response.json().error).toBe("PASSKEY_CHALLENGE_INVALID")
    })

    it("refuses a credential made for another origin with 400 PASSKEY_INVALID and counts it", async () => {
      const before = await failuresCounted("passkey", "admin")
      const token = await sessionOf(admin)
      const options = await creationOptions(admin, token)

      const response = await register(admin, token, {
        challengeId: options.json().challengeId,
        name: "Phished",
        password: PASSWORD,
        credential: new SoftwareAuthenticator().register(options.json().options, "https://backoffice.example")
      })

      expect(response.statusCode).toBe(400)
      expect(response.json().error).toBe("PASSKEY_INVALID")
      expect(await failuresCounted("passkey", "admin")).toBe(before + 1)
      expect(harness.passkeys.rows).toHaveLength(0)
    })

    it("refuses an authenticator that did not verify its user", async () => {
      const response = await enrol(admin, new SoftwareAuthenticator({ verifiesUser: false }))

      expect(response.statusCode).toBe(400)
      expect(response.json().error).toBe("PASSKEY_INVALID")
    })

    it("refuses an answer to other options", async () => {
      const token = await sessionOf(admin)
      const options = await creationOptions(admin, token)
      const elsewhere = await creationOptions(admin, token)

      const response = await register(admin, token, {
        challengeId: options.json().challengeId,
        name: "Crossed",
        password: PASSWORD,
        credential: new SoftwareAuthenticator().register(elsewhere.json().options, ORIGIN)
      })

      expect(response.statusCode).toBe(400)
      expect(response.json().error).toBe("PASSKEY_INVALID")
    })

    it("holds at most ten: options and registration both answer 409 PASSKEY_LIMIT", async () => {
      await seedPasskeys(admin, 9)
      const token = await sessionOf(admin)
      const pending = await creationOptions(admin, token)
      expect((await enrol(admin, new SoftwareAuthenticator())).statusCode).toBe(201)

      const options = await creationOptions(admin, token)
      const late = await register(admin, token, {
        challengeId: pending.json().challengeId,
        name: "Eleventh",
        password: PASSWORD,
        credential: new SoftwareAuthenticator().register(pending.json().options, ORIGIN)
      })

      expect(options.statusCode).toBe(409)
      expect(options.json().error).toBe("PASSKEY_LIMIT")
      expect(late.statusCode).toBe(409)
      expect(late.json().error).toBe("PASSKEY_LIMIT")
      expect(await harness.passkeys.listForUser(ADMIN_ID)).toHaveLength(10)
    })

    it("does not end the account's other sessions", async () => {
      await sessionOf(admin)
      await sessionOf(admin)

      await enrol(admin, new SoftwareAuthenticator())

      expect(harness.refreshRepo.rows.length).toBeGreaterThan(0)
      expect(harness.refreshRepo.rows.every((row: { revokedAt?: Date | null }) => !row.revokedAt)).toBe(true)
    })

    it("belongs to its owner: an admin is refused another account's passkeys with 403", async () => {
      const token = await sessionOf(admin)
      const path = `/api/v1/auth/passkeys/${OTHER_ID}`

      const responses = [
        await send({ method: "GET", url: path, headers: bearer(token) }),
        await send({ method: "POST", url: `${path}/options`, headers: bearer(token) }),
        await send({ method: "POST", url: path, headers: bearer(token), payload: {} }),
        await send({
          method: "DELETE",
          url: `${path}/00000000-0000-4000-8000-000000000000`,
          headers: bearer(token),
          payload: { password: PASSWORD }
        })
      ]

      expect(responses.map((response) => response.statusCode)).toEqual([403, 403, 403, 403])
    })

    it("is not reachable with an admin's enrolment token", async () => {
      const enrolment = harness.tokens.issueEnrolment(
        { id: ADMIN_ID, email: admin.email, role: "admin" },
        principalOf(ADMIN_ID),
        null
      )

      const response = await creationOptions(admin, enrolment.token)

      expect(response.statusCode).toBe(403)
      expect(response.json().error).toBe("TWO_FACTOR_ENROLMENT_ONLY")
    })

    it("is audited as an admin action", async () => {
      const log = jest.spyOn(Logger.prototype, "log")

      await enrol(admin, new SoftwareAuthenticator())

      const audited = log.mock.calls
        .map((call) => call[0] as LoggedEvent)
        .filter((event) => event.message === "admin_action")
        .map((event) => [event.fields?.action, event.fields?.target, event.fields?.outcome])

      expect(audited).toEqual([
        ["identity.passkey_options", String(ADMIN_ID), "done"],
        ["identity.passkey_add", String(ADMIN_ID), "done"]
      ])
    })
  })

  describe("listing and removing", () => {
    it("lists the account's passkeys with their name, dates, device type and backup state only", async () => {
      await enrol(admin, new SoftwareAuthenticator(), "Laptop")
      await enrol(admin, new SoftwareAuthenticator({ backedUp: true }), "Phone")
      await enrol(other, new SoftwareAuthenticator(), "Someone else's")

      const response = await list(admin, await sessionOf(admin))

      expect(response.statusCode).toBe(200)
      expect(Object.keys(response.json())).toEqual(["passkeys"])
      const passkeys = response.json().passkeys
      expect(passkeys.map((passkey: { name: string }) => passkey.name)).toEqual(["Laptop", "Phone"])
      expect(passkeys.every((passkey: object) => Object.keys(passkey).sort().join() === VIEW_KEYS.join())).toBe(true)
    })

    it("removes one with the password and answers 204", async () => {
      const added = await enrol(admin, new SoftwareAuthenticator())

      const response = await remove(admin, await sessionOf(admin), added.json().id, { password: PASSWORD })

      expect(response.statusCode).toBe(204)
      expect(response.body).toBe("")
      expect(harness.passkeys.rows).toHaveLength(0)
    })

    it("keeps it when the password is wrong or missing", async () => {
      const added = await enrol(admin, new SoftwareAuthenticator())
      const token = await sessionOf(admin)

      const wrong = await remove(admin, token, added.json().id, { password: "not-the-password" })
      const missing = await remove(admin, token, added.json().id, {})

      expect(wrong.statusCode).toBe(401)
      expect(missing.statusCode).toBe(400)
      expect(harness.passkeys.rows).toHaveLength(1)
    })

    it("answers 404 for another account's passkey and for one that does not exist", async () => {
      const theirs = await enrol(other, new SoftwareAuthenticator())
      const token = await sessionOf(admin)

      const foreign = await remove(admin, token, theirs.json().id, { password: PASSWORD })
      const unknown = await remove(admin, token, "00000000-0000-4000-8000-000000000000", { password: PASSWORD })

      expect(foreign.statusCode).toBe(404)
      expect(foreign.json().error).toBe("PASSKEY_NOT_FOUND")
      expect(typeof foreign.json().traceId).toBe("string")
      expect(unknown.statusCode).toBe(404)
      expect(harness.passkeys.rows).toHaveLength(1)
    })

    it("refuses a passkey id that is not a UUID with 400", async () => {
      const response = await remove(admin, await sessionOf(admin), "not-a-uuid", { password: PASSWORD })

      expect(response.statusCode).toBe(400)
    })
  })

  describe("signing in with one", () => {
    it("tells the challenge whether the account holds a passkey", async () => {
      const without = await login(admin)
      await enrol(admin, new SoftwareAuthenticator())
      const holding = await login(admin)

      expect(without.json().passkeys).toBe(false)
      expect(holding.json().passkeys).toBe(true)
      expect(holding.json().mfaRequired).toBe(true)
    })

    it("answers request options: the account's passkeys, user verification required, 120 s", async () => {
      const authenticator = new SoftwareAuthenticator()
      await enrol(admin, authenticator)
      const token = await challengeFor(admin)

      const response = await requestOptions(token)

      expect(response.statusCode).toBe(200)
      expect(Object.keys(response.json())).toEqual(["options"])
      const options: PublicKeyCredentialRequestOptionsJSON = response.json().options
      expect(options.rpId).toBe("backoffice.localhost")
      expect(options.userVerification).toBe("required")
      expect(options.timeout).toBe(120_000)
      expect(options.allowCredentials).toEqual([{ id: authenticator.id, transports: ["internal"], type: "public-key" }])
    })

    it("answers 409 NO_PASSKEYS for an account that holds none", async () => {
      const response = await requestOptions(await challengeFor(admin))

      expect(response.statusCode).toBe(409)
      expect(response.json().error).toBe("NO_PASSKEYS")
    })

    it("answers the token pair, records the use and clears the account's attempts", async () => {
      const authenticator = new SoftwareAuthenticator()
      await enrol(admin, authenticator)

      const response = await signInWith(authenticator, await challengeFor(admin))

      expect(response.statusCode).toBe(200)
      expect(response.json().refreshToken).toBeDefined()
      expect(response.json().user.principalId).toBe(principalOf(ADMIN_ID))
      expect((jwt.decode(response.json().accessToken) as jwt.JwtPayload).role).toBe("admin")
      expect(harness.passkeys.rows[0].signCount).toBe(1)
      expect(harness.passkeys.rows[0].lastUsedAt).toBeInstanceOf(Date)
      expect(harness.attempts.accounts.get(accountKeyOf(admin.email))).toBeUndefined()

      const listed = await list(admin, response.json().accessToken)
      expect(listed.json().passkeys[0].lastUsedAt).not.toBeNull()
    })

    it("signs in with an RS256 passkey and with one whose counter stays at zero", async () => {
      const rsa = new SoftwareAuthenticator({ algorithm: "RS256" })
      const synced = new SoftwareAuthenticator({ backedUp: true, counterStep: 0 })
      await enrol(admin, rsa)
      await enrol(admin, synced)

      const first = await signInWith(rsa, await challengeFor(admin))
      const second = await signInWith(synced, await challengeFor(admin))
      const third = await signInWith(synced, await challengeFor(admin))

      expect([first.statusCode, second.statusCode, third.statusCode]).toEqual([200, 200, 200])
    })

    it("spends the challenge once: neither a second passkey answer nor a code reuses it", async () => {
      const authenticator = new SoftwareAuthenticator()
      await enrol(admin, authenticator)
      const token = await challengeFor(admin)
      const options = await signInOptions(token)

      const first = await answer(token, authenticator.assert(options, ORIGIN))
      const again = await requestOptions(token)
      const code = await answerWithCode(token)

      expect(first.statusCode).toBe(200)
      expect(again.statusCode).toBe(401)
      expect(again.json().error).toBe("CHALLENGE_SPENT")
      expect(code.statusCode).toBe(401)
      expect(code.json().error).toBe("CHALLENGE_SPENT")
    })

    it("keeps the challenge open after 401 PASSKEY_REFUSED, for a passkey or the code", async () => {
      const authenticator = new SoftwareAuthenticator()
      await enrol(admin, authenticator)
      const token = await challengeFor(admin)

      const forged = await signInWith(authenticator.impostor(), token)
      const genuine = await signInWith(authenticator, token)

      expect(forged.statusCode).toBe(401)
      expect(forged.json().error).toBe("PASSKEY_REFUSED")
      expect(typeof forged.json().traceId).toBe("string")
      expect(genuine.statusCode).toBe(200)

      const second = await challengeFor(admin)
      await signInWith(authenticator.impostor(), second)
      expect((await answerWithCode(second)).statusCode).toBe(200)
    })

    it("refuses an answer when no options are open, and the challenge stays open", async () => {
      const authenticator = new SoftwareAuthenticator()
      await enrol(admin, authenticator)
      const token = await challengeFor(admin)
      const options = await signInOptions(token)
      const assertion = authenticator.assert(options, ORIGIN)
      harness.passkeyChallenges.rows.clear()

      const response = await answer(token, assertion)

      expect(response.statusCode).toBe(401)
      expect(response.json().error).toBe("PASSKEY_REFUSED")
      expect((await signInWith(authenticator, token)).statusCode).toBe(200)
    })

    it("lets new options replace the open ones", async () => {
      const authenticator = new SoftwareAuthenticator()
      await enrol(admin, authenticator)
      const token = await challengeFor(admin)
      const replaced = await signInOptions(token)
      await signInOptions(token)

      const response = await answer(token, authenticator.assert(replaced, ORIGIN))

      expect(response.statusCode).toBe(401)
      expect(response.json().error).toBe("PASSKEY_REFUSED")
    })

    it("refuses options older than 120 s", async () => {
      const authenticator = new SoftwareAuthenticator()
      await enrol(admin, authenticator)
      const token = await challengeFor(admin)
      const options = await signInOptions(token)
      harness.passkeyChallenges.advance(121)

      const response = await answer(token, authenticator.assert(options, ORIGIN))

      expect(response.statusCode).toBe(401)
      expect(response.json().error).toBe("PASSKEY_REFUSED")
    })

    it("refuses another account's passkey", async () => {
      await enrol(admin, new SoftwareAuthenticator())
      const theirs = new SoftwareAuthenticator()
      await enrol(other, theirs)

      const response = await signInWith(theirs, await challengeFor(admin))

      expect(response.statusCode).toBe(401)
      expect(response.json().error).toBe("PASSKEY_REFUSED")
    })

    it("refuses an authenticator that did not verify its user", async () => {
      const authenticator = new SoftwareAuthenticator()
      await enrol(admin, authenticator)

      const response = await signInWith(authenticator.withoutUserVerification(), await challengeFor(admin))

      expect(response.statusCode).toBe(401)
      expect(response.json().error).toBe("PASSKEY_REFUSED")
    })

    it("refuses a signature counter that does not move forward, the mark of a cloned authenticator", async () => {
      const authenticator = new SoftwareAuthenticator()
      await enrol(admin, authenticator)
      expect((await signInWith(authenticator, await challengeFor(admin))).statusCode).toBe(200)
      authenticator.counter = 0

      const response = await signInWith(authenticator, await challengeFor(admin))

      expect(response.statusCode).toBe(401)
      expect(response.json().error).toBe("PASSKEY_REFUSED")
      expect(harness.passkeys.rows[0].signCount).toBe(1)
    })

    it("ends the challenge when another sign-in moved the counter first", async () => {
      const authenticator = new SoftwareAuthenticator()
      await enrol(admin, authenticator)
      const token = await challengeFor(admin)
      jest.spyOn(harness.passkeys, "recordUse").mockResolvedValueOnce(false)

      const response = await signInWith(authenticator, token)

      expect(response.statusCode).toBe(401)
      expect(response.json().error).toBe("CHALLENGE_SPENT")
      expect(response.json().accessToken).toBeUndefined()
      expect((await answerWithCode(token)).json().error).toBe("CHALLENGE_SPENT")
    })

    it("allows five answers per challenge; the sixth is refused even when it is right", async () => {
      const authenticator = new SoftwareAuthenticator()
      await enrol(admin, authenticator)
      const token = await challengeFor(admin)

      for (let forged = 0; forged < 5; forged++) {
        expect((await signInWith(authenticator.impostor(), token)).json().error).toBe("PASSKEY_REFUSED")
      }

      const sixth = await signInWith(authenticator, token)

      expect(sixth.statusCode).toBe(401)
      expect(sixth.json().error).toBe("CHALLENGE_EXHAUSTED")
    })

    it("waits out the account's delay before reading anything, and leaves the options open", async () => {
      const authenticator = new SoftwareAuthenticator()
      await enrol(admin, authenticator)
      const token = await challengeFor(admin)
      const options = await signInOptions(token)
      harness.attempts.accounts.set(accountKeyOf(admin.email), {
        attempts: 9,
        lastAttemptAt: new Date(),
        delayedUntil: new Date(Date.now() + 86_400_000)
      })

      const response = await answer(token, authenticator.assert(options, ORIGIN))

      expect(response.statusCode).toBe(429)
      expect(response.json().error).toBe("SIGN_IN_DELAYED")
      const open = [...harness.passkeyChallenges.rows.values()].find((row) => row.mfaJti === jtiOf(token))
      expect(open?.used).toBe(false)
    })

    it("counts and logs every refusal under stage passkey, with its reason, never the credential", async () => {
      const authenticator = new SoftwareAuthenticator()
      await enrol(admin, authenticator)
      const before = await failuresCounted("passkey", "admin")
      const log = jest.spyOn(Logger.prototype, "warn")
      const token = await challengeFor(admin)
      const options = await signInOptions(token)
      const forged = authenticator.impostor().assert(options, ORIGIN)

      await answer(token, forged)

      expect(await failuresCounted("passkey", "admin")).toBe(before + 1)
      const logged = warnings(log)
      expect(logged).toHaveLength(1)
      expect(logged[0].fields).toEqual(
        expect.objectContaining({ stage: "passkey", role: "admin", reason: "passkey_refused", user_id: ADMIN_ID })
      )

      expect(typeof logged[0].fields?.detail).toBe("string")
      expect(JSON.stringify(logged[0])).not.toContain(forged.response.signature)
      expect(JSON.stringify(logged[0])).not.toContain(admin.email)
    })

    it("names the reason when the passkey is not the account's", async () => {
      await enrol(admin, new SoftwareAuthenticator())
      const stranger = new SoftwareAuthenticator()
      const log = jest.spyOn(Logger.prototype, "warn")

      await signInWith(stranger, await challengeFor(admin))

      expect(warnings(log).map((event) => event.fields?.reason)).toEqual(["unknown_passkey"])
    })

    it("refuses a token that is not a challenge, and an account whose code was turned off", async () => {
      const authenticator = new SoftwareAuthenticator()
      await enrol(other, authenticator)
      const token = await challengeFor(other)
      other.isTwoFactorEnabled = false
      other.twoFactorSecret = null

      const notAChallenge = await requestOptions(await sessionOf(admin))
      const options = await requestOptions(token)
      const verify = await answer(token, authenticator.assert({ challenge: "x", rpId: "backoffice.localhost" }, ORIGIN))

      expect(notAChallenge.statusCode).toBe(401)
      expect(notAChallenge.json().error).toBe("CHALLENGE_INVALID")
      expect(options.json().error).toBe("CHALLENGE_INVALID")
      expect(verify.json().error).toBe("CHALLENGE_INVALID")
    })

    it("refuses a malformed answer with 400 before it is counted", async () => {
      const token = await challengeFor(admin)

      const response = await answer(token, "not-an-object")

      expect(response.statusCode).toBe(400)
      expect(harness.attempts.challenges.get(jtiOf(token))).toBeUndefined()
    })

    it("is guarded by the client proof: an unknown client is refused before anything is read", async () => {
      const authenticator = new SoftwareAuthenticator()
      await enrol(admin, authenticator)
      const token = await challengeFor(admin)
      const headers = { "x-kinetix-client": "unheard-of" }

      const options = await requestOptions(token, headers)
      const verify = await answer(token, {}, headers)

      expect(options.statusCode).toBe(400)
      expect(options.json().error).toBe("UNKNOWN_CLIENT")
      expect(verify.statusCode).toBe(400)
      expect(verify.json().error).toBe("UNKNOWN_CLIENT")
      expect(harness.attempts.challenges.get(jtiOf(token))).toBeUndefined()
    })

    it("starts a session that belongs to the client that answered", async () => {
      const authenticator = new SoftwareAuthenticator()
      await enrol(admin, authenticator)
      const headers = { "x-kinetix-client": "courier-app" }
      const token = await challengeFor(admin, headers)
      const options = (await requestOptions(token, headers)).json().options

      const response = await answer(token, authenticator.assert(options, ORIGIN), headers)

      expect(response.statusCode).toBe(200)
      expect((jwt.decode(response.json().accessToken) as jwt.JwtPayload).azp).toBe("courier-app")
    })
  })
})
