import * as bcrypt from "bcrypt"
import * as jwt from "jsonwebtoken"
import { Logger } from "@nestjs/common"
import type { InjectOptions, LightMyRequestResponse } from "fastify"
import UserEntity from "../src/domain/entities/user.entity"
import { sessionClientDecision } from "../src/domain/session_client"
import { metricsRegistry } from "../src/infrastructure/observability/metrics_registry"
import type { TokenPair } from "../src/types/token.type"
import { attestedGate } from "./support/client_gates"
import FakeAppCheck from "./support/fake_app_check"
import { GATEWAY_ADDRESS } from "./support/http_app"
import { identityApp, principalOf } from "./support/identity_app"
import TestClock from "./support/test_clock"

const PASSWORD = "courier-fixture-password"

const COURIER = { id: 3, email: "courier@kinetix.test", role: "courier" }

const HOUR_MS = 60 * 60 * 1000

let addressCounter = 0

function freshAddress(): string {
  addressCounter += 1
  return `198.18.0.${addressCounter % 250}`
}

function claimsOf(token: string): jwt.JwtPayload {
  return jwt.decode(token) as jwt.JwtPayload
}

async function mismatchesCounted(client: string): Promise<number> {
  const metric = await metricsRegistry.getSingleMetric("kinetix_identity_client_proof_refusals_total")?.get()
  const sample = metric?.values.find((value) => {
    return value.labels.client === client && value.labels.reason === "client_mismatch"
  })
  return sample?.value ?? 0
}

describe("the decision a renewal makes about the session's client", () => {
  it.each([
    [null, { kind: "unnamed" as const }, "continue"],
    [null, { kind: "named" as const, name: "courier-app" }, "bind"],
    ["courier-app", { kind: "named" as const, name: "courier-app" }, "continue"],
    ["courier-app", { kind: "named" as const, name: "seller-web" }, "mismatch"],
    ["courier-app", { kind: "unnamed" as const }, "mismatch"]
  ])("a session of %s renewed by %j is %s", (session, request, decision) => {
    expect(sessionClientDecision(session, request)).toBe(decision)
  })
})

describe("a session remembers the client that started it", () => {
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

  function asCourierApp(): Record<string, string> {
    return { "X-Kinetix-Client": "courier-app", "X-Firebase-AppCheck": fake.proof(clock.now) }
  }

  function asSellerWeb(): Record<string, string> {
    return { "X-Kinetix-Client": "seller-web" }
  }

  async function refresh(refreshToken: string, headers: Record<string, string>): Promise<LightMyRequestResponse> {
    return await send({ method: "POST", url: "/api/v1/auth/refresh", headers, payload: { refreshToken } })
  }

  async function courierAppSession(): Promise<TokenPair> {
    const response = await send({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: asCourierApp(),
      payload: { email: COURIER.email, password: PASSWORD }
    })
    expect(response.statusCode).toBe(200)

    return response.json()
  }

  async function oldUnnamedSession(): Promise<TokenPair> {
    return await harness.tokens.issuePair(COURIER, principalOf(COURIER.id), null)
  }

  function rowOf(refreshToken: string): Record<string, any> {
    const row = harness.refreshRepo.rows.find((candidate) => candidate.jti === claimsOf(refreshToken).jti)
    expect(row).toBeDefined()
    return row as Record<string, any>
  }

  beforeAll(async () => {
    fake = await FakeAppCheck.start()
  })

  afterAll(async () => {
    await fake.stop()
  })

  beforeEach(async () => {
    clock = new TestClock()
    harness = await identityApp(attestedGate(fake, clock))
    harness.users.add(new UserEntity(COURIER.id, COURIER.email, await bcrypt.hash(PASSWORD, 4), "courier"))
  })

  afterEach(async () => {
    jest.restoreAllMocks()
    await harness.app.close()
  })

  describe("a session the courier app started", () => {
    it("is renewed by the courier app and stays its own", async () => {
      const session = await courierAppSession()

      const renewed = await refresh(session.refreshToken, asCourierApp())

      expect(renewed.statusCode).toBe(200)
      expect(claimsOf(renewed.json().accessToken).azp).toBe("courier-app")
      expect(rowOf(renewed.json().refreshToken).client).toBe("courier-app")
    })

    it("is not renewed by a client that names no client, and its refresh token is not spent", async () => {
      const session = await courierAppSession()

      const refused = await refresh(session.refreshToken, {})

      expect(refused.statusCode).toBe(401)
      expect(Object.keys(refused.json()).sort()).toEqual(["error", "message", "traceId"])
      expect(refused.json().error).toBe("CLIENT_MISMATCH")
      expect(rowOf(session.refreshToken).usedAt).toBeUndefined()
      expect((await refresh(session.refreshToken, asCourierApp())).statusCode).toBe(200)
    })

    it("is not renewed by another client, and its refresh token is not spent", async () => {
      const session = await courierAppSession()

      const refused = await refresh(session.refreshToken, asSellerWeb())

      expect(refused.statusCode).toBe(401)
      expect(refused.json().error).toBe("CLIENT_MISMATCH")
      expect(rowOf(session.refreshToken).usedAt).toBeUndefined()
      expect(rowOf(session.refreshToken).revokedAt).toBeUndefined()
    })

    it("counts and logs a mismatch with both clients, the account and the request id", async () => {
      const session = await courierAppSession()
      const before = await mismatchesCounted("seller-web")
      const warn = jest.spyOn(Logger.prototype, "warn")

      await refresh(session.refreshToken, { ...asSellerWeb(), "x-request-id": "req-mismatch-1" })

      const refusal = warn.mock.calls
        .map((call) => call[0] as { message: string; requestId?: string; fields?: Record<string, unknown> })
        .find((event) => event.message === "client_proof_refused")
      expect(refusal?.requestId).toBe("req-mismatch-1")
      expect(refusal?.fields).toEqual({
        event: "client_proof_refused",
        client: "seller-web",
        reason: "client_mismatch",
        session_client: "courier-app",
        user_id: COURIER.id
      })
      expect(await mismatchesCounted("seller-web")).toBe(before + 1)
      expect(JSON.stringify(warn.mock.calls)).not.toContain(session.refreshToken)
    })

    it("is refused before the admin rule, so another client cannot end an admin's session", async () => {
      harness.users.add(new UserEntity(1, "admin@kinetix.test", "hash", "admin"))
      const admin = await harness.tokens.issuePair(
        { id: 1, email: "admin@kinetix.test", role: "admin" },
        principalOf(1),
        "courier-app"
      )

      const refused = await refresh(admin.refreshToken, asSellerWeb())

      expect(refused.json().error).toBe("CLIENT_MISMATCH")
      expect(rowOf(admin.refreshToken).revokedAt).toBeUndefined()
    })

    it("is refused inside the rotation too, when the stored session names another client than its token", async () => {
      const session = await courierAppSession()
      rowOf(session.refreshToken).client = "seller-web"

      const refused = await refresh(session.refreshToken, asCourierApp())

      expect(refused.statusCode).toBe(401)
      expect(refused.json().error).toBe("CLIENT_MISMATCH")
      expect(rowOf(session.refreshToken).usedAt).toBeUndefined()
    })
  })

  describe("a session that names no client, as every session before the client proof does", () => {
    it("is renewed by the courier app once and from then on belongs to it", async () => {
      const old = await oldUnnamedSession()
      const log = jest.spyOn(Logger.prototype, "log")

      const bound = await refresh(old.refreshToken, { ...asCourierApp(), "x-request-id": "req-bind-1" })

      expect(bound.statusCode).toBe(200)
      expect(claimsOf(bound.json().accessToken).azp).toBe("courier-app")
      expect(claimsOf(bound.json().refreshToken).azp).toBe("courier-app")
      expect(rowOf(bound.json().refreshToken).client).toBe("courier-app")
      expect(rowOf(old.refreshToken).client).toBeNull()

      const binding = log.mock.calls
        .map((call) => call[0] as { message: string; requestId?: string; fields?: Record<string, unknown> })
        .find((event) => event.fields?.event === "client_session_bound")
      expect(binding?.requestId).toBe("req-bind-1")
      expect(binding?.fields).toEqual({ event: "client_session_bound", client: "courier-app", user_id: COURIER.id })

      expect((await refresh(bound.json().refreshToken, {})).json().error).toBe("CLIENT_MISMATCH")
      expect((await refresh(bound.json().refreshToken, asSellerWeb())).json().error).toBe("CLIENT_MISMATCH")
      expect((await refresh(bound.json().refreshToken, asCourierApp())).statusCode).toBe(200)
    })

    it("is bound once: its spent token presented again is reuse, and the session ends", async () => {
      const old = await oldUnnamedSession()
      const bound = await refresh(old.refreshToken, asCourierApp())

      const replayed = await refresh(old.refreshToken, asCourierApp())

      expect(replayed.statusCode).toBe(401)
      expect(replayed.json().message).toContain("already been used")
      expect((await refresh(bound.json().refreshToken, asCourierApp())).statusCode).toBe(401)
    })

    it("is renewed unnamed while unnamed clients are allowed, and stays unnamed", async () => {
      const old = await oldUnnamedSession()

      const renewed = await refresh(old.refreshToken, {})

      expect(renewed.statusCode).toBe(200)
      expect(claimsOf(renewed.json().accessToken).azp).toBeUndefined()
      expect(rowOf(renewed.json().refreshToken).client).toBeNull()
    })

    it("is not bound by a proof that fails, and its refresh token is not spent", async () => {
      const old = await oldUnnamedSession()
      const stale = fake.proof(clock.now)
      clock.advance(2 * HOUR_MS)

      const refused = await refresh(old.refreshToken, {
        "X-Kinetix-Client": "courier-app",
        "X-Firebase-AppCheck": stale
      })

      expect(refused.json().error).toBe("CLIENT_PROOF_INVALID")
      expect(rowOf(old.refreshToken).usedAt).toBeUndefined()
      expect(rowOf(old.refreshToken).client).toBeNull()
    })
  })
})
