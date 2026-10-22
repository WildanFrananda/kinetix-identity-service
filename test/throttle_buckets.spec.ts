import type { NestFastifyApplication } from "@nestjs/platform-fastify"
import AuthController from "../src/adapters/controllers/auth.controller"
import AuthUsecaseService from "../src/application/services/auth_usecase.service"
import { isGatewayHop } from "../src/infrastructure/http/gateway_hop"
import { GATEWAY_ADDRESS, httpApp, send } from "./support/http_app"

const LOGIN = { email: "someone@kinetix.test", password: "fixture-password" }

describe("throttle buckets behind the gateway", () => {
  let app: NestFastifyApplication

  beforeEach(async () => {
    const auth = {
      login: jest.fn().mockResolvedValue({ mfaRequired: true, challengeToken: "c", expiresIn: 300 })
    }

    app = await httpApp([AuthController], [{ provide: AuthUsecaseService, useValue: auth }])
  })

  afterEach(async () => {
    await app.close()
  })

  async function loginFrom(forwardedFor: string, peer: string = GATEWAY_ADDRESS): Promise<number> {
    const response = await send(app, {
      method: "POST",
      url: "/api/v1/auth/login",
      payload: LOGIN,
      remoteAddress: peer,
      headers: { "x-forwarded-for": forwardedFor }
    })

    return response.statusCode
  }

  it("gives two clients behind the gateway two buckets", async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      expect(await loginFrom("203.0.113.10")).toBe(200)
    }
    expect(await loginFrom("203.0.113.10")).toBe(429)

    expect(await loginFrom("203.0.113.20")).toBe(200)
  })

  it("does not let a forged X-Forwarded-For choose the bucket", async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      expect(await loginFrom(`198.51.100.${attempt}, 203.0.113.10`)).toBe(200)
    }

    expect(await loginFrom("198.51.100.99, 203.0.113.10")).toBe(429)
  })

  it("does not trust a forwarding header from a peer outside the internal network", async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      expect(await loginFrom(`203.0.113.${attempt + 30}`, "198.51.100.7")).toBe(200)
    }

    expect(await loginFrom("203.0.113.99", "198.51.100.7")).toBe(429)
  })
})

describe("which hop identity trusts", () => {
  it.each(["172.18.0.4", "10.0.0.2", "192.168.65.1", "127.0.0.1", "::1", "::ffff:172.18.0.4", "fd00::4"])(
    "trusts %s as the gateway when it is the immediate peer",
    (address) => {
      expect(isGatewayHop(address, 0)).toBe(true)
    }
  )

  it.each(["203.0.113.10", "::ffff:203.0.113.10", "2001:db8::1", "not-an-address", ""])(
    "does not trust %s as the gateway",
    (address) => {
      expect(isGatewayHop(address, 0)).toBe(false)
    }
  )

  it("never trusts a second hop, even an internal one", () => {
    expect(isGatewayHop("172.18.0.9", 1)).toBe(false)
  })
})
