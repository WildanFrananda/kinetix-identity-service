import * as bcrypt from "bcrypt"
import * as jwt from "jsonwebtoken"
import type { NestFastifyApplication } from "@nestjs/platform-fastify"
import type { InjectOptions, LightMyRequestResponse } from "fastify"
import UserEntity from "../src/domain/entities/user.entity"
import { codeAt } from "../src/infrastructure/crypto/totp"
import { GATEWAY_ADDRESS } from "./support/http_app"
import { identityApp } from "./support/identity_app"

const PASSWORD = "admin-fixture-password"

const ADMIN_ID = 1

const STAFF_ROUTES: ReadonlyArray<[string, string]> = [
  ["GET", "/api/v1/auth/me"],
  ["POST", "/api/v1/auth/logout"],
  ["POST", `/api/v1/auth/2fa/disable/${ADMIN_ID}`],
  ["GET", "/api/v1/sellers/applications"],
  ["GET", "/api/v1/sellers/7/application"],
  ["POST", "/api/v1/sellers/7/onboard"],
  ["POST", "/api/v1/sellers/7/verify"],
  ["POST", "/api/v1/sellers/7/reject"],
  ["GET", "/api/v1/couriers/applications"],
  ["POST", "/api/v1/couriers/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/approve"],
  ["GET", "/api/v1/users/7/profile"],
  ["PUT", "/api/v1/users/7/profile"]
]

let addressCounter = 0

function freshAddress(): string {
  addressCounter += 1
  return `203.0.113.${addressCounter % 250}`
}

describe("an admin without a second factor", () => {
  let harness: Awaited<ReturnType<typeof identityApp>>
  let app: NestFastifyApplication
  let admin: UserEntity

  async function send(options: InjectOptions): Promise<LightMyRequestResponse> {
    return await app.getHttpAdapter().getInstance().inject({
      remoteAddress: GATEWAY_ADDRESS,
      ...options,
      headers: { "x-forwarded-for": freshAddress(), ...(options.headers ?? {}) }
    })
  }

  async function signIn(): Promise<LightMyRequestResponse> {
    return await send({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: admin.email, password: PASSWORD }
    })
  }

  async function enrolmentToken(): Promise<string> {
    const response = await signIn()
    expect(response.statusCode).toBe(200)
    return response.json().enrolmentToken
  }

  function bearer(token: string): Record<string, string> {
    return { authorization: `Bearer ${token}` }
  }

  function currentCode(secret: string): string {
    return codeAt(secret, Math.floor(Date.now() / 1000 / 30))
  }

  beforeEach(async () => {
    harness = await identityApp()
    app = harness.app
    admin = harness.users.add(
      new UserEntity(ADMIN_ID, "admin@kinetix.test", await bcrypt.hash(PASSWORD, 4), "admin")
    )
  })

  afterEach(async () => {
    await app.close()
  })

  it("signs in to a restricted session: no tokens, no refresh token", async () => {
    const response = await signIn()

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.mfaEnrolmentRequired).toBe(true)
    expect(body.userId).toBe(ADMIN_ID)
    expect(body.expiresIn).toBe(600)
    expect(body.accessToken).toBeUndefined()
    expect(body.refreshToken).toBeUndefined()
    expect(harness.refreshRepo.rows).toHaveLength(0)
  })

  it("is given a token that carries no role, no email, no session and a type no service accepts", async () => {
    const claims = jwt.decode(await enrolmentToken()) as jwt.JwtPayload

    expect(claims.token_use).toBe("mfa_enrolment")
    expect(claims.role).toBeUndefined()
    expect(claims.email).toBeUndefined()
    expect(claims.fam).toBeUndefined()
    expect((claims.exp ?? 0) - (claims.iat ?? 0)).toBe(600)
  })

  it.each(STAFF_ROUTES)("cannot reach %s %s with it", async (method, url) => {
    const token = await enrolmentToken()

    const response = await send({ method: method as InjectOptions["method"], url, headers: bearer(token) })

    expect(response.statusCode).toBe(403)
    expect(response.json().error).toBe("TWO_FACTOR_ENROLMENT_ONLY")
    expect(harness.sellers.listApplications).not.toHaveBeenCalled()
    expect(harness.sellers.approveVerification).not.toHaveBeenCalled()
    expect(harness.couriers.approveCourier).not.toHaveBeenCalled()
    expect(harness.profiles.getProfile).not.toHaveBeenCalled()
  })

  it("cannot use it as a refresh token or as a two-factor challenge", async () => {
    const token = await enrolmentToken()

    const refresh = await send({ method: "POST", url: "/api/v1/auth/refresh", payload: { refreshToken: token } })
    const verify = await send({
      method: "POST",
      url: "/api/v1/auth/2fa/verify",
      payload: { challengeToken: token, code: "123456" }
    })

    expect(refresh.statusCode).toBe(401)
    expect(verify.statusCode).toBe(401)
  })

  it("is refused by the verifier the gRPC ValidateToken uses", async () => {
    const token = await enrolmentToken()

    await expect(harness.tokens.verifyAccess(token)).rejects.toThrow("This is not an access token")
  })

  it("may set up and enable a second factor with it, and enabling ends the restricted session", async () => {
    const token = await enrolmentToken()

    const setup = await send({ method: "POST", url: `/api/v1/auth/2fa/setup/${ADMIN_ID}`, headers: bearer(token) })
    expect(setup.statusCode).toBe(200)
    const secret: string = setup.json().twoFactorSecret

    const enable = await send({
      method: "POST",
      url: `/api/v1/auth/2fa/enable/${ADMIN_ID}`,
      headers: bearer(token),
      payload: { code: currentCode(secret) }
    })
    expect(enable.statusCode).toBe(200)
    expect(admin.isTwoFactorEnabled).toBe(true)

    const again = await send({ method: "POST", url: `/api/v1/auth/2fa/setup/${ADMIN_ID}`, headers: bearer(token) })
    expect(again.statusCode).toBe(401)
  })

  it("signs in again with the second factor and only then reaches staff routes", async () => {
    const token = await enrolmentToken()
    const setup = await send({ method: "POST", url: `/api/v1/auth/2fa/setup/${ADMIN_ID}`, headers: bearer(token) })
    const secret: string = setup.json().twoFactorSecret
    await send({
      method: "POST",
      url: `/api/v1/auth/2fa/enable/${ADMIN_ID}`,
      headers: bearer(token),
      payload: { code: currentCode(secret) }
    })

    const challenge = await signIn()
    expect(challenge.json().mfaRequired).toBe(true)

    const nextStep = Math.floor(Date.now() / 1000 / 30) + 1
    const verified = await send({
      method: "POST",
      url: "/api/v1/auth/2fa/verify",
      payload: { challengeToken: challenge.json().challengeToken, code: codeAt(secret, nextStep) }
    })
    expect(verified.statusCode).toBe(200)
    expect((jwt.decode(verified.json().accessToken) as jwt.JwtPayload).role).toBe("admin")

    const staff = await send({
      method: "GET",
      url: "/api/v1/sellers/applications",
      headers: bearer(verified.json().accessToken)
    })
    expect(staff.statusCode).toBe(200)
  })

  it("does not set up another account's second factor with it", async () => {
    harness.users.add(new UserEntity(7, "seller@kinetix.test", "hash", "customer"))
    const token = await enrolmentToken()

    const response = await send({ method: "POST", url: "/api/v1/auth/2fa/setup/7", headers: bearer(token) })

    expect(response.statusCode).toBe(403)
  })

  it("cannot renew a session minted before the rule: the refresh is refused and the session ends", async () => {
    const pair = await harness.tokens.issuePair(
      { id: ADMIN_ID, email: admin.email, role: "admin" },
      "00000000-0000-4000-8000-000000000001",
      null
    )

    const response = await send({
      method: "POST",
      url: "/api/v1/auth/refresh",
      payload: { refreshToken: pair.refreshToken }
    })

    expect(response.statusCode).toBe(401)
    expect(response.json().error).toBe("TWO_FACTOR_REQUIRED")
    expect(harness.refreshRepo.rows.every((row: { revokedAt?: Date }) => row.revokedAt instanceof Date)).toBe(true)
  })
})

describe("an admin who turns the second factor off", () => {
  it("loses every session, the current one included", async () => {
    const harness = await identityApp()
    const secret = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP"
    const passwordHash = await bcrypt.hash(PASSWORD, 4)
    const admin = harness.users.add(
      new UserEntity(ADMIN_ID, "admin@kinetix.test", passwordHash, "admin", true, new Date(), new Date(), secret)
    )
    const pair = await harness.tokens.issuePair({ id: admin.id, email: admin.email, role: "admin" }, "p-admin", null)

    const disabled = await harness.app.getHttpAdapter().getInstance().inject({
      method: "POST",
      url: `/api/v1/auth/2fa/disable/${ADMIN_ID}`,
      remoteAddress: GATEWAY_ADDRESS,
      headers: { authorization: `Bearer ${pair.accessToken}` },
      payload: { code: codeAt(secret, Math.floor(Date.now() / 1000 / 30)), password: PASSWORD }
    })
    const after = await harness.app.getHttpAdapter().getInstance().inject({
      method: "GET",
      url: "/api/v1/auth/me",
      remoteAddress: GATEWAY_ADDRESS,
      headers: { authorization: `Bearer ${pair.accessToken}` }
    })

    expect(disabled.statusCode).toBe(200)
    expect(after.statusCode).toBe(401)
    expect(harness.refreshRepo.rows.every((row: { revokedAt?: Date }) => row.revokedAt instanceof Date)).toBe(true)

    await harness.app.close()
  })
})
