import * as bcrypt from "bcrypt"
import type { InjectOptions, LightMyRequestResponse } from "fastify"
import UserEntity from "../src/domain/entities/user.entity"
import { codeAt } from "../src/infrastructure/crypto/totp"
import { metricsRegistry } from "../src/infrastructure/observability/metrics_registry"
import type { TokenPair } from "../src/types/token.type"
import { GATEWAY_ADDRESS } from "./support/http_app"
import { identityApp, principalOf } from "./support/identity_app"

const PASSWORD = "customer-fixture-password"

const SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP"

const PLAIN = 5

const GUARDED = 6

let addressCounter = 0

function freshAddress(): string {
  addressCounter += 1
  return `198.51.100.${addressCounter % 250}`
}

function currentCode(): string {
  return codeAt(SECRET, Math.floor(Date.now() / 1000 / 30))
}

async function passwordFailures(): Promise<number> {
  const metric = await metricsRegistry.getSingleMetric("kinetix_identity_sign_in_failures_total")?.get()
  const sample = metric?.values.find((value) => value.labels.stage === "password" && value.labels.role === "other")
  return sample?.value ?? 0
}

describe("changing the second factor from a signed-in session needs the current password", () => {
  let harness: Awaited<ReturnType<typeof identityApp>>
  let plain: UserEntity
  let guarded: UserEntity

  async function send(options: InjectOptions): Promise<LightMyRequestResponse> {
    return await harness.app.getHttpAdapter().getInstance().inject({
      remoteAddress: GATEWAY_ADDRESS,
      ...options,
      headers: { "x-forwarded-for": freshAddress(), ...(options.headers ?? {}) }
    })
  }

  async function sessionOf(user: UserEntity): Promise<TokenPair> {
    return await harness.tokens.issuePair(
      { id: user.id, email: user.email, role: user.role },
      principalOf(user.id),
      null
    )
  }

  async function call(
    route: "setup" | "enable" | "disable",
    user: UserEntity,
    payload: Record<string, unknown>
  ): Promise<LightMyRequestResponse> {
    const session = await sessionOf(user)

    return await send({
      method: "POST",
      url: `/api/v1/auth/2fa/${route}/${user.id}`,
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload
    })
  }

  function comparable(response: LightMyRequestResponse): Record<string, unknown> {
    const { traceId, ...body } = response.json()
    expect(typeof traceId).toBe("string")
    return { status: response.statusCode, body }
  }

  beforeEach(async () => {
    harness = await identityApp()
    const hash = await bcrypt.hash(PASSWORD, 4)
    plain = harness.users.add(new UserEntity(PLAIN, "plain@kinetix.test", hash, "customer"))
    guarded = harness.users.add(
      new UserEntity(GUARDED, "guarded@kinetix.test", hash, "customer", true, new Date(), new Date(), SECRET)
    )
  })

  afterEach(async () => {
    await harness.app.close()
  })

  describe("setup", () => {
    it("is refused without the password, before anything is counted or written", async () => {
      const response = await call("setup", plain, {})

      expect(response.statusCode).toBe(400)
      expect(response.json().error).toBe("PASSWORD_REQUIRED")
      expect(harness.attempts.accounts.size).toBe(0)
      expect(plain.twoFactorSecret).toBeNull()
    })

    it("refuses a wrong password exactly as sign-in does, and writes no secret", async () => {
      const atSignIn = await send({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { email: plain.email, password: "wrong-password" }
      })
      harness.attempts.accounts.clear()

      const atSetup = await call("setup", plain, { password: "wrong-password" })

      expect(comparable(atSetup)).toEqual(comparable(atSignIn))
      expect(atSetup.statusCode).toBe(401)
      expect(plain.twoFactorSecret).toBeNull()
    })

    it("counts a wrong password on the account's sign-in counter and failure metric", async () => {
      const before = await passwordFailures()
      const statuses: number[] = []

      for (let attempt = 0; attempt < 7; attempt++) {
        statuses.push((await call("setup", plain, { password: "wrong-password" })).statusCode)
      }

      const signIn = await send({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { email: plain.email, password: PASSWORD }
      })

      expect(statuses).toEqual([401, 401, 401, 401, 401, 429, 429])
      expect(await passwordFailures()).toBe(before + 5)
      expect(signIn.statusCode).toBe(429)
    })

    it("hands out a secret for the right password", async () => {
      const response = await call("setup", plain, { password: PASSWORD })

      expect(response.statusCode).toBe(200)
      expect(response.json().twoFactorSecret).toBe(plain.twoFactorSecret)
    })
  })

  describe("enable", () => {
    beforeEach(() => {
      plain.twoFactorSecret = SECRET
    })

    it("is refused without the password", async () => {
      const response = await call("enable", plain, { code: currentCode() })

      expect(response.statusCode).toBe(400)
      expect(response.json().error).toBe("PASSWORD_REQUIRED")
      expect(plain.isTwoFactorEnabled).toBe(false)
    })

    it("refuses a wrong password with a right code, and does not check the code", async () => {
      const response = await call("enable", plain, { code: currentCode(), password: "wrong-password" })

      expect(response.statusCode).toBe(401)
      expect(response.json().message).toBe("Invalid email or password credentials")
      expect(plain.isTwoFactorEnabled).toBe(false)
      expect((await call("enable", plain, { code: currentCode(), password: PASSWORD })).statusCode).toBe(200)
    })

    it("counts a password and a code in one request as one attempt", async () => {
      await call("enable", plain, { code: "000000", password: PASSWORD })

      expect([...harness.attempts.accounts.values()].map((state) => state.attempts)).toEqual([1])
    })

    it("turns it on with the right password and code", async () => {
      const response = await call("enable", plain, { code: currentCode(), password: PASSWORD })

      expect(response.statusCode).toBe(200)
      expect(plain.isTwoFactorEnabled).toBe(true)
    })
  })

  describe("disable", () => {
    it("is refused without the password", async () => {
      const response = await call("disable", guarded, { code: currentCode() })

      expect(response.statusCode).toBe(400)
      expect(guarded.isTwoFactorEnabled).toBe(true)
    })

    it("refuses a wrong password with a right code", async () => {
      const response = await call("disable", guarded, { code: currentCode(), password: "wrong-password" })

      expect(response.statusCode).toBe(401)
      expect(response.json().message).toBe("Invalid email or password credentials")
      expect(guarded.isTwoFactorEnabled).toBe(true)
      expect(guarded.twoFactorSecret).toBe(SECRET)
    })

    it("still needs a right code with the right password", async () => {
      const response = await call("disable", guarded, { code: "000000", password: PASSWORD })

      expect(response.statusCode).toBe(422)
      expect(guarded.isTwoFactorEnabled).toBe(true)
    })

    it("turns it off with the right password and code", async () => {
      const response = await call("disable", guarded, { code: currentCode(), password: PASSWORD })

      expect(response.statusCode).toBe(200)
      expect(guarded.isTwoFactorEnabled).toBe(false)
    })
  })

  describe("with an admin's enrolment token, given for the password at most ten minutes ago", () => {
    it("sets up and enables without asking for the password again", async () => {
      const admin = harness.users.add(
        new UserEntity(1, "admin@kinetix.test", await bcrypt.hash(PASSWORD, 4), "admin")
      )
      const enrolment = harness.tokens.issueEnrolment(
        { id: admin.id, email: admin.email, role: admin.role },
        principalOf(admin.id),
        null
      )
      const bearer = { authorization: `Bearer ${enrolment.token}` }

      const setup = await send({ method: "POST", url: "/api/v1/auth/2fa/setup/1", headers: bearer })
      const enable = await send({
        method: "POST",
        url: "/api/v1/auth/2fa/enable/1",
        headers: bearer,
        payload: { code: codeAt(setup.json().twoFactorSecret, Math.floor(Date.now() / 1000 / 30)) }
      })

      expect(setup.statusCode).toBe(200)
      expect(enable.statusCode).toBe(200)
      expect(admin.isTwoFactorEnabled).toBe(true)
    })
  })
})
