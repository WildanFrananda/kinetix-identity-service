import * as bcrypt from "bcrypt"
import * as jwt from "jsonwebtoken"
import { Logger } from "@nestjs/common"
import type { InjectOptions, LightMyRequestResponse } from "fastify"
import UserEntity from "../src/domain/entities/user.entity"
import { codeAt } from "../src/infrastructure/crypto/totp"
import { metricsRegistry } from "../src/infrastructure/observability/metrics_registry"
import { attestedGate } from "./support/client_gates"
import FakeAppCheck from "./support/fake_app_check"
import { GATEWAY_ADDRESS } from "./support/http_app"
import { identityApp } from "./support/identity_app"
import TestClock from "./support/test_clock"

const PASSWORD = "courier-fixture-password"

const SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP"

const HOUR_MS = 60 * 60 * 1000

let addressCounter = 0

function freshAddress(): string {
  addressCounter += 1
  return `192.0.2.${addressCounter % 250}`
}

function courierAppHeaders(proof: string): Record<string, string> {
  return { "X-Kinetix-Client": "courier-app", "X-Firebase-AppCheck": proof }
}

function claimsOf(token: string): jwt.JwtPayload {
  return jwt.decode(token) as jwt.JwtPayload
}

function withoutTrace(response: LightMyRequestResponse): Record<string, unknown> {
  const { traceId, ...body } = response.json()
  expect(typeof traceId).toBe("string")
  return { status: response.statusCode, body }
}

async function refusalsCounted(client: string, reason: string): Promise<number | undefined> {
  const metric = await metricsRegistry.getSingleMetric("kinetix_identity_client_proof_refusals_total")?.get()
  const sample = metric?.values.find((value) => value.labels.client === client && value.labels.reason === reason)
  return sample?.value
}

describe("the client proof identity asks of the courier app", () => {
  let fake: FakeAppCheck
  let clock: TestClock
  let harness: Awaited<ReturnType<typeof identityApp>>

  async function send(options: InjectOptions): Promise<LightMyRequestResponse> {
    return await harness.app.getHttpAdapter().getInstance().inject({
      remoteAddress: GATEWAY_ADDRESS,
      ...options,
      headers: { "x-forwarded-for": freshAddress(), ...(options.headers ?? {}) }
    })
  }

  async function login(headers: Record<string, string>, password: string = PASSWORD): Promise<LightMyRequestResponse> {
    return await send({
      method: "POST",
      url: "/api/v1/auth/login",
      headers,
      payload: { email: "courier@kinetix.test", password }
    })
  }

  function proof(): string {
    return fake.proof(clock.now)
  }

  function storedClients(): unknown[] {
    return harness.refreshRepo.rows.map((row) => row.client)
  }

  async function start(overrides: Record<string, string> = {}): Promise<void> {
    harness = await identityApp(attestedGate(fake, clock, overrides))
    harness.users.add(new UserEntity(3, "courier@kinetix.test", await bcrypt.hash(PASSWORD, 4), "courier"))
    harness.users.add(
      new UserEntity(
        4,
        "guarded@kinetix.test",
        await bcrypt.hash(PASSWORD, 4),
        "courier",
        true,
        new Date(),
        new Date(),
        SECRET
      )
    )
  }

  beforeAll(async () => {
    fake = await FakeAppCheck.start()
  })

  afterAll(async () => {
    await fake.stop()
  })

  beforeEach(async () => {
    fake.answerWith({ kind: "keys" })
    clock = new TestClock()
    await start()
  })

  afterEach(async () => {
    jest.restoreAllMocks()
    await harness.app.close()
  })

  describe("with the courier app's own headers", () => {
    it("signs in and names the client in both tokens and in the stored session", async () => {
      const response = await login(courierAppHeaders(proof()))

      expect(response.statusCode).toBe(200)
      expect(claimsOf(response.json().accessToken).azp).toBe("courier-app")
      expect(claimsOf(response.json().refreshToken).azp).toBe("courier-app")
      expect(storedClients()).toEqual(["courier-app"])
    })

    it("answers a two-factor challenge", async () => {
      const challenge = await send({
        method: "POST",
        url: "/api/v1/auth/login",
        headers: courierAppHeaders(proof()),
        payload: { email: "guarded@kinetix.test", password: PASSWORD }
      })
      expect(challenge.json().mfaRequired).toBe(true)

      const verified = await send({
        method: "POST",
        url: "/api/v1/auth/2fa/verify",
        headers: courierAppHeaders(proof()),
        payload: {
          challengeToken: challenge.json().challengeToken,
          code: codeAt(SECRET, Math.floor(Date.now() / 1000 / 30))
        }
      })

      expect(verified.statusCode).toBe(200)
      expect(claimsOf(verified.json().accessToken).azp).toBe("courier-app")
    })

    it("registers a courier", async () => {
      const response = await send({
        method: "POST",
        url: "/api/v1/couriers/register",
        headers: courierAppHeaders(proof()),
        payload: {
          email: "new.courier@kinetix.test",
          password: "new-courier-password",
          fullName: "Budi Santoso",
          phoneNumber: "081200000000",
          vehiclePlate: "B 1234 KIN",
          capacityKg: 150
        }
      })

      expect(response.statusCode).toBe(201)
      expect(response.json().driverId).toBe(42)
      expect(claimsOf(response.json().accessToken).azp).toBe("courier-app")
    })

    it("renews the session it started", async () => {
      const session = await login(courierAppHeaders(proof()))

      const renewed = await send({
        method: "POST",
        url: "/api/v1/auth/refresh",
        headers: courierAppHeaders(proof()),
        payload: { refreshToken: session.json().refreshToken }
      })

      expect(renewed.statusCode).toBe(200)
      expect(claimsOf(renewed.json().refreshToken).azp).toBe("courier-app")
    })

    it("signs out with no proof at all", async () => {
      const session = await login(courierAppHeaders(proof()))

      const response = await send({
        method: "POST",
        url: "/api/v1/auth/logout",
        headers: { authorization: `Bearer ${session.json().accessToken}` },
        payload: { refreshToken: session.json().refreshToken }
      })

      expect(response.statusCode).toBe(204)
    })
  })

  describe.each([
    ["login", "/api/v1/auth/login", { email: "courier@kinetix.test", password: PASSWORD }],
    ["two-factor verify", "/api/v1/auth/2fa/verify", { challengeToken: "challenge", code: "123456" }],
    ["courier registration", "/api/v1/couriers/register", { email: "c@kinetix.test", password: PASSWORD }],
    ["refresh", "/api/v1/auth/refresh", { refreshToken: "refresh" }],
    ["registration", "/api/v1/auth/register", { email: "b@kinetix.test", password: PASSWORD }]
  ])("%s", (_route, url, payload) => {
    async function post(headers: Record<string, string>): Promise<LightMyRequestResponse> {
      return await send({ method: "POST", url, headers, payload })
    }

    it("refuses a courier app that sends no proof: 401 CLIENT_PROOF_REQUIRED", async () => {
      const response = await post({ "X-Kinetix-Client": "courier-app" })

      expect(response.statusCode).toBe(401)
      expect(Object.keys(response.json()).sort()).toEqual(["error", "message", "traceId"])
      expect(response.json().error).toBe("CLIENT_PROOF_REQUIRED")
    })

    it("refuses an expired proof: 401 CLIENT_PROOF_INVALID", async () => {
      const stale = proof()
      clock.advance(2 * HOUR_MS)

      const response = await post(courierAppHeaders(stale))

      expect(response.statusCode).toBe(401)
      expect(response.json().error).toBe("CLIENT_PROOF_INVALID")
    })

    it("answers 503 CLIENT_PROOF_UNAVAILABLE, never 401, when Google's keys cannot be read", async () => {
      fake.answerWith({ kind: "drop" })

      const response = await post(courierAppHeaders(proof()))

      expect(response.statusCode).toBe(503)
      expect(response.json().error).toBe("CLIENT_PROOF_UNAVAILABLE")
    })

    it("refuses a client name identity does not know: 400 UNKNOWN_CLIENT", async () => {
      const response = await post({ "X-Kinetix-Client": "courier-app-pro", "X-Firebase-AppCheck": proof() })

      expect(response.statusCode).toBe(400)
      expect(response.json().error).toBe("UNKNOWN_CLIENT")
    })
  })

  it("tells the client nothing about which check its proof failed", async () => {
    const reasons = [
      fake.proof(clock.now - 2 * HOUR_MS),
      fake.proof(clock.now, { claims: { iss: "https://firebaseappcheck.googleapis.com/999999999999" } }),
      fake.proof(clock.now, { claims: { sub: `1:${fake.projectNumber}:web:00aa11bb22cc33dd` } }),
      fake.proof(clock.now, { kid: "0000000000000000" }),
      fake.proof(clock.now, { algorithm: "RS512" }),
      "not-a-token"
    ]

    const answers: Record<string, unknown>[] = []
    for (const bad of reasons) {
      answers.push(withoutTrace(await login(courierAppHeaders(bad))))
    }

    expect(new Set(answers.map((answer) => JSON.stringify(answer))).size).toBe(1)
    expect(answers[0]).toEqual({
      status: 401,
      body: {
        error: "CLIENT_PROOF_INVALID",
        message: "The client's proof was not accepted. Fetch a fresh one and try again."
      }
    })
  })

  describe("before the password", () => {
    it("refuses the proof without reading the password or counting an attempt", async () => {
      const compare = jest.spyOn(bcrypt, "compare")
      const failures = await metricsRegistry.getSingleMetric("kinetix_identity_sign_in_failures_total")?.get()

      for (let attempt = 0; attempt < 10; attempt++) {
        expect((await login({ "X-Kinetix-Client": "courier-app" }, "wrong-password")).statusCode).toBe(401)
      }

      expect(compare).not.toHaveBeenCalled()
      expect(harness.attempts.accounts.size).toBe(0)
      expect(await metricsRegistry.getSingleMetric("kinetix_identity_sign_in_failures_total")?.get()).toEqual(failures)
      expect((await login(courierAppHeaders(proof()))).statusCode).toBe(200)
    })

    it("still counts a wrong password once the proof is good", async () => {
      expect((await login(courierAppHeaders(proof()), "wrong-password")).statusCode).toBe(401)

      expect([...harness.attempts.accounts.values()].map((state) => state.attempts)).toEqual([1])
    })
  })

  describe("a refused renewal", () => {
    async function refreshWith(headers: Record<string, string>, refreshToken: string): Promise<LightMyRequestResponse> {
      return await send({ method: "POST", url: "/api/v1/auth/refresh", headers, payload: { refreshToken } })
    }

    it("leaves the refresh token good for the app's retry with a fresh proof", async () => {
      const session = await login(courierAppHeaders(proof()))
      const stale = proof()
      clock.advance(2 * HOUR_MS)

      const refused = await refreshWith(courierAppHeaders(stale), session.json().refreshToken)
      const retried = await refreshWith(courierAppHeaders(proof()), session.json().refreshToken)

      expect(refused.json().error).toBe("CLIENT_PROOF_INVALID")
      expect(retried.statusCode).toBe(200)
    })

    it("leaves the refresh token good while the proof cannot be checked", async () => {
      const session = await login(courierAppHeaders(proof()))
      fake.answerWith({ kind: "drop" })
      clock.advance(7 * HOUR_MS)

      const unavailable = await refreshWith(courierAppHeaders(proof()), session.json().refreshToken)
      fake.answerWith({ kind: "keys" })
      clock.advance(11 * 1000)
      const later = await refreshWith(courierAppHeaders(proof()), session.json().refreshToken)

      expect(unavailable.statusCode).toBe(503)
      expect(later.statusCode).toBe(200)
    })
  })

  describe("a client that names itself without a proof kind", () => {
    it("is trusted by its name alone and named in its tokens", async () => {
      const response = await login({ "X-Kinetix-Client": "seller-web" })

      expect(response.statusCode).toBe(200)
      expect(claimsOf(response.json().accessToken).azp).toBe("seller-web")
    })
  })

  describe("a client that does not name itself", () => {
    it("is let in while unnamed clients are allowed, and its tokens name no client", async () => {
      const response = await login({})

      expect(response.statusCode).toBe(200)
      expect(claimsOf(response.json().accessToken).azp).toBeUndefined()
      expect(claimsOf(response.json().refreshToken).azp).toBeUndefined()
      expect(storedClients()).toEqual([null])
    })

    it.each([
      ["/api/v1/auth/login", { email: "courier@kinetix.test", password: PASSWORD }],
      ["/api/v1/auth/2fa/verify", { challengeToken: "challenge", code: "123456" }],
      ["/api/v1/couriers/register", { email: "c@kinetix.test", password: PASSWORD }],
      ["/api/v1/auth/refresh", { refreshToken: "refresh" }],
      ["/api/v1/auth/register", { email: "b@kinetix.test", password: PASSWORD }]
    ])("is refused on %s once unnamed clients are refused: 400 CLIENT_REQUIRED", async (url, payload) => {
      await harness.app.close()
      await start({ IDENTITY_UNNAMED_CLIENTS: "refuse" })

      const response = await send({ method: "POST", url, payload })

      expect(response.statusCode).toBe(400)
      expect(response.json().error).toBe("CLIENT_REQUIRED")
    })
  })

  describe("what a refusal leaves behind", () => {
    it("publishes every refusal reason of an attested client at zero", async () => {
      for (const reason of ["missing", "invalid_signature", "expired", "wrong_project", "wrong_app_id"]) {
        expect(await refusalsCounted("courier-app", reason)).toBeDefined()
      }
      expect(await refusalsCounted("courier-app", "keys_unavailable")).toBeDefined()
      expect(await refusalsCounted("unknown", "unknown_client")).toBeDefined()
      expect(await refusalsCounted("unnamed", "client_required")).toBeDefined()
    })

    it("counts each refusal by client and reason", async () => {
      const before = (await refusalsCounted("courier-app", "wrong_app_id")) ?? 0

      await login(courierAppHeaders(fake.proof(clock.now, { claims: { sub: `1:${fake.projectNumber}:web:00aa` } })))

      expect(await refusalsCounted("courier-app", "wrong_app_id")).toBe(before + 1)
    })

    it("logs the client, the reason and the request id at warn, and never the proof", async () => {
      const warn = jest.spyOn(Logger.prototype, "warn")
      const log = jest.spyOn(Logger.prototype, "log")
      const error = jest.spyOn(Logger.prototype, "error")
      const stale = proof()
      clock.advance(2 * HOUR_MS)

      await login({ ...courierAppHeaders(stale), "x-request-id": "req-proof-1" })

      const refusal = warn.mock.calls
        .map((call) => call[0] as { message: string; requestId?: string; fields?: Record<string, unknown> })
        .find((event) => event.message === "client_proof_refused")
      const everything = JSON.stringify([...warn.mock.calls, ...log.mock.calls, ...error.mock.calls])

      expect(refusal?.requestId).toBe("req-proof-1")
      expect(refusal?.fields).toEqual({ event: "client_proof_refused", client: "courier-app", reason: "expired" })
      expect(everything).not.toContain(stale)
      expect(everything).not.toContain(stale.split(".")[2])
    })

    it("logs an outage of Google's keys with the reason it could not read them", async () => {
      const error = jest.spyOn(Logger.prototype, "error")
      fake.answerWith({ kind: "status", status: 502, body: "bad gateway", contentType: "text/plain" })

      await login(courierAppHeaders(proof()))

      const outage = error.mock.calls
        .map((call) => call[0] as { message: string; fields?: Record<string, unknown> })
        .find((event) => event.fields?.event === "app_check_keys_unavailable")
      expect(outage?.fields?.reason).toBe("the key set answered HTTP 502")
    })
  })
})
