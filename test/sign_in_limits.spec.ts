import * as bcrypt from "bcrypt"
import { Logger } from "@nestjs/common"
import type { NestFastifyApplication } from "@nestjs/platform-fastify"
import type { InjectOptions, LightMyRequestResponse } from "fastify"
import UserEntity from "../src/domain/entities/user.entity"
import { accountKeyOf } from "../src/infrastructure/crypto/account_key"
import { codeAt } from "../src/infrastructure/crypto/totp"
import { metricsRegistry } from "../src/infrastructure/observability/metrics_registry"
import { GATEWAY_ADDRESS } from "./support/http_app"
import { identityApp, principalOf } from "./support/identity_app"

const PASSWORD = "customer-fixture-password"

const SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP"

const GUARDED_EMAIL = "guarded@kinetix.test"

let addressCounter = 0

function freshAddress(): string {
  addressCounter += 1
  return `198.51.100.${addressCounter % 250}`
}

async function failuresCounted(stage: string, role: string): Promise<number> {
  const metric = await metricsRegistry.getSingleMetric("kinetix_identity_sign_in_failures_total")?.get()
  const sample = metric?.values.find((value) => value.labels.stage === stage && value.labels.role === role)
  return sample?.value ?? 0
}

describe("sign-in attempts per account and per challenge", () => {
  let harness: Awaited<ReturnType<typeof identityApp>>
  let app: NestFastifyApplication

  async function send(options: InjectOptions): Promise<LightMyRequestResponse> {
    return await app.getHttpAdapter().getInstance().inject({
      remoteAddress: GATEWAY_ADDRESS,
      ...options,
      headers: { "x-forwarded-for": freshAddress(), ...(options.headers ?? {}) }
    })
  }

  async function login(email: string, password: string): Promise<LightMyRequestResponse> {
    return await send({ method: "POST", url: "/api/v1/auth/login", payload: { email, password } })
  }

  function comparable(response: LightMyRequestResponse): Record<string, unknown> {
    const { traceId, ...body } = response.json()
    expect(typeof traceId).toBe("string")
    return { status: response.statusCode, retryAfter: response.headers["retry-after"] ?? null, body }
  }

  beforeEach(async () => {
    harness = await identityApp()
    app = harness.app
    harness.users.add(new UserEntity(3, "known@kinetix.test", await bcrypt.hash(PASSWORD, 4), "customer"))
    harness.users.add(
      new UserEntity(
        4,
        GUARDED_EMAIL,
        await bcrypt.hash(PASSWORD, 4),
        "customer",
        true,
        new Date(),
        new Date(),
        SECRET
      )
    )
  })

  afterEach(async () => {
    await app.close()
  })

  describe("a challenge", () => {
    async function challenge(): Promise<string> {
      const response = await login(GUARDED_EMAIL, PASSWORD)
      expect(response.json().mfaRequired).toBe(true)
      return response.json().challengeToken
    }

    async function verify(challengeToken: string, code: string): Promise<LightMyRequestResponse> {
      return await send({ method: "POST", url: "/api/v1/auth/2fa/verify", payload: { challengeToken, code } })
    }

    async function answer(challengeToken: string, code: string): Promise<LightMyRequestResponse> {
      harness.attempts.advance(120)
      return await verify(challengeToken, code)
    }

    function currentCode(): string {
      return codeAt(SECRET, Math.floor(Date.now() / 1000 / 30))
    }

    function attemptsOn(email: string): number {
      return harness.attempts.accounts.get(accountKeyOf(email))?.attempts ?? 0
    }

    function refused(error: string, message: string): Record<string, unknown> {
      return { status: 401, retryAfter: null, body: { error, message } }
    }

    function challengeFor(id: number, email: string): string {
      return harness.tokens.issueMfaChallenge({ id, email, role: "customer" }, principalOf(id)).token
    }

    function expiredChallenge(): string {
      const past = Date.now() - 301_000
      const clock = jest.spyOn(Date, "now").mockReturnValue(past)

      try {
        return challengeFor(4, GUARDED_EMAIL)
      } finally {
        clock.mockRestore()
      }
    }

    function enrolmentToken(): string {
      const subject = { id: 4, email: GUARDED_EMAIL, role: "customer" } as const

      return harness.tokens.issueEnrolment(subject, principalOf(4), null).token
    }

    it("refuses the sixth attempt after five wrong codes, from a new address and with the right code", async () => {
      const token = await challenge()

      for (let wrong = 0; wrong < 5; wrong++) {
        const response = await answer(token, "000000")
        expect(response.statusCode).toBe(401)
        expect(response.json().message).toBe("That code is not valid")
      }

      const right = codeAt(SECRET, Math.floor(Date.now() / 1000 / 30))
      const sixth = await answer(token, right)

      expect(sixth.statusCode).toBe(401)
      expect(sixth.json().message).toBe("This challenge allows no more attempts; sign in again")
      expect(sixth.json().accessToken).toBeUndefined()
    })

    it("still takes the right code after four wrong ones", async () => {
      const token = await challenge()
      for (let wrong = 0; wrong < 4; wrong++) {
        await answer(token, "000000")
      }

      const right = await answer(token, codeAt(SECRET, Math.floor(Date.now() / 1000 / 30)))

      expect(right.statusCode).toBe(200)
      expect(right.json().accessToken).toBeDefined()
    })

    it("counts every wrong code on the account's failure metric", async () => {
      const before = await failuresCounted("two_factor", "other")
      const token = await challenge()

      await answer(token, "000000")
      await answer(token, "000000")

      expect(await failuresCounted("two_factor", "other")).toBe(before + 2)
    })

    describe("refusals carry a machine code beside the message", () => {
      it("names a wrong code WRONG_CODE, and the challenge stays open", async () => {
        const token = await challenge()

        const wrong = await answer(token, "000000")
        const right = await answer(token, currentCode())

        expect(comparable(wrong)).toEqual(refused("WRONG_CODE", "That code is not valid"))
        expect(right.statusCode).toBe(200)
      })

      it("names a challenge whose five attempts are used CHALLENGE_EXHAUSTED", async () => {
        const token = await challenge()
        for (let wrong = 0; wrong < 5; wrong++) {
          await answer(token, "000000")
        }

        expect(comparable(await answer(token, currentCode()))).toEqual(
          refused("CHALLENGE_EXHAUSTED", "This challenge allows no more attempts; sign in again")
        )
      })

      it("names a challenge that already signed in CHALLENGE_SPENT, whatever the code", async () => {
        const token = await challenge()
        expect((await answer(token, currentCode())).statusCode).toBe(200)

        const spent = refused("CHALLENGE_SPENT", "This challenge has already been answered; sign in again")

        expect(comparable(await answer(token, currentCode()))).toEqual(spent)
        expect(comparable(await answer(token, "000000"))).toEqual(spent)
      })

      it("names a code another sign-in used CHALLENGE_SPENT, because answering spent the challenge", async () => {
        const first = await challenge()
        const second = await challenge()
        const code = currentCode()
        expect((await answer(first, code)).statusCode).toBe(200)

        const reused = await answer(second, code)
        const again = await answer(second, currentCode())

        expect(comparable(reused)).toEqual(
          refused("CHALLENGE_SPENT", "That code has already been used; sign in again with the next one")
        )
        expect(comparable(again)).toEqual(
          refused("CHALLENGE_SPENT", "This challenge has already been answered; sign in again")
        )
      })

      it.each([
        ["is not a token", "Invalid token", () => "not-a-token"],
        ["has expired", "Invalid token", () => expiredChallenge()],
        ["is another kind of token", "This is not a two-factor challenge", () => enrolmentToken()],
        [
          "names an account that no longer exists",
          "The account behind this challenge no longer exists",
          () => challengeFor(99, "gone@kinetix.test")
        ],
        [
          "names an account without two-factor",
          "This account does not have two-factor authentication enabled",
          () => challengeFor(3, "known@kinetix.test")
        ]
      ])("names a challenge that %s CHALLENGE_INVALID", async (_case, message, tokenOf) => {
        expect(comparable(await answer(tokenOf(), currentCode()))).toEqual(refused("CHALLENGE_INVALID", message))
      })
    })

    describe("the account's counter", () => {
      it("counts a wrong code on an open challenge", async () => {
        const token = await challenge()
        const before = attemptsOn(GUARDED_EMAIL)

        await answer(token, "000000")
        await answer(token, "000000")

        expect(attemptsOn(GUARDED_EMAIL)).toBe(before + 2)
      })

      it("does not count a request on an exhausted challenge, which cannot be a guess at the code", async () => {
        const token = await challenge()
        for (let wrong = 0; wrong < 5; wrong++) {
          await answer(token, "000000")
        }
        const counted = attemptsOn(GUARDED_EMAIL)

        const codes: unknown[] = []
        for (let again = 0; again < 3; again++) {
          codes.push((await answer(token, currentCode())).json().error)
        }

        expect(attemptsOn(GUARDED_EMAIL)).toBe(counted)
        expect(codes).toEqual(["CHALLENGE_EXHAUSTED", "CHALLENGE_EXHAUSTED", "CHALLENGE_EXHAUSTED"])
      })

      it("answers an exhausted challenge as exhausted while the account is delayed", async () => {
        const token = await challenge()
        for (let wrong = 0; wrong < 5; wrong++) {
          await answer(token, "000000")
        }

        const refusal = await verify(token, currentCode())

        expect(comparable(refusal)).toEqual(
          refused("CHALLENGE_EXHAUSTED", "This challenge allows no more attempts; sign in again")
        )
      })

      it("does not count a request on a spent challenge", async () => {
        const token = await challenge()
        expect((await answer(token, currentCode())).statusCode).toBe(200)
        expect(attemptsOn(GUARDED_EMAIL)).toBe(0)

        const codes: unknown[] = []
        for (let again = 0; again < 3; again++) {
          codes.push((await answer(token, "000000")).json().error)
        }

        expect(attemptsOn(GUARDED_EMAIL)).toBe(0)
        expect(codes).toEqual(["CHALLENGE_SPENT", "CHALLENGE_SPENT", "CHALLENGE_SPENT"])
      })

      it("does not count a request on a challenge that is not valid", async () => {
        await challenge()
        const counted = attemptsOn(GUARDED_EMAIL)

        const refusal = await answer(expiredChallenge(), "000000")

        expect(attemptsOn(GUARDED_EMAIL)).toBe(counted)
        expect(refusal.json().error).toBe("CHALLENGE_INVALID")
      })

      it("still answers SIGN_IN_DELAYED to a code on an open challenge while the account is delayed", async () => {
        const token = await challenge()
        for (let wrong = 0; wrong < 4; wrong++) {
          await answer(token, "000000")
        }

        const delayed = await verify(token, currentCode())

        expect(delayed.statusCode).toBe(429)
        expect(delayed.json().error).toBe("SIGN_IN_DELAYED")
        expect((await answer(token, currentCode())).statusCode).toBe(200)
      })
    })
  })

  describe("an account", () => {
    it("is slowed after five failures, whichever addresses they came from", async () => {
      for (let wrong = 0; wrong < 5; wrong++) {
        expect((await login("known@kinetix.test", "wrong-password")).statusCode).toBe(401)
      }

      const slowed = await login("known@kinetix.test", PASSWORD)

      expect(slowed.statusCode).toBe(429)
      expect(slowed.headers["retry-after"]).toBe("1")
      expect(slowed.json().error).toBe("SIGN_IN_DELAYED")
      expect(slowed.json().retryAfterSeconds).toBe(1)
      expect(slowed.json().accessToken).toBeUndefined()
    })

    it("doubles the delay with each further failure, up to a minute and no longer", async () => {
      const delays: string[] = []

      for (let attempt = 0; attempt < 13; attempt++) {
        await login("known@kinetix.test", "wrong-password")
        const refused = await login("known@kinetix.test", "wrong-password")
        delays.push(String(refused.headers["retry-after"] ?? "none"))
        harness.attempts.advance(Number(refused.headers["retry-after"] ?? 0))
      }

      expect(delays).toEqual(["none", "none", "1", "2", "4", "8", "16", "32", "60", "60", "60", "60", "60"])
    })

    it("lets the owner in once the delay has passed: slowed, never locked out", async () => {
      for (let wrong = 0; wrong < 20; wrong++) {
        await login("known@kinetix.test", "wrong-password")
        harness.attempts.advance(60)
      }

      expect((await login("known@kinetix.test", PASSWORD)).statusCode).toBe(200)
    })

    it("starts counting again after a successful sign-in", async () => {
      for (let wrong = 0; wrong < 4; wrong++) {
        await login("known@kinetix.test", "wrong-password")
      }
      expect((await login("known@kinetix.test", PASSWORD)).statusCode).toBe(200)

      for (let wrong = 0; wrong < 4; wrong++) {
        expect((await login("known@kinetix.test", "wrong-password")).statusCode).toBe(401)
      }
    })

    it("does not count a delayed request as an attempt, so waiting is enough", async () => {
      for (let wrong = 0; wrong < 5; wrong++) {
        await login("known@kinetix.test", "wrong-password")
      }
      for (let refused = 0; refused < 10; refused++) {
        expect((await login("known@kinetix.test", "wrong-password")).statusCode).toBe(429)
      }

      harness.attempts.advance(1)

      expect((await login("known@kinetix.test", PASSWORD)).statusCode).toBe(200)
    })

    it("answers an unknown email exactly as it answers a wrong password, delays included", async () => {
      const known: Record<string, unknown>[] = []
      const unknown: Record<string, unknown>[] = []

      for (let attempt = 0; attempt < 8; attempt++) {
        known.push(comparable(await login("known@kinetix.test", "wrong-password")))
        unknown.push(comparable(await login("nobody@kinetix.test", "wrong-password")))
      }

      expect(unknown).toEqual(known)
      expect(known.map((answer) => answer.status)).toEqual([401, 401, 401, 401, 401, 429, 429, 429])
    })

    it("logs each failure without the email, the password or the code", async () => {
      const warn = jest.spyOn(Logger.prototype, "warn")

      await send({
        method: "POST",
        url: "/api/v1/auth/login",
        headers: { "x-request-id": "req-failure-1" },
        payload: { email: "known@kinetix.test", password: "wrong-password" }
      })

      const failure = warn.mock.calls
        .map((call) => call[0] as { message: string; requestId?: string; fields?: Record<string, unknown> })
        .find((event) => event.message === "sign_in_failure")
      warn.mockRestore()

      expect(failure?.requestId).toBe("req-failure-1")
      expect(failure?.fields).toEqual(
        expect.objectContaining({ stage: "password", role: "other", reason: "wrong_password", user_id: 3 })
      )
      expect(JSON.stringify(failure)).not.toContain("known@kinetix.test")
      expect(JSON.stringify(failure)).not.toContain("wrong-password")
    })

    it("counts an admin's failures apart from everyone else's", async () => {
      harness.users.add(new UserEntity(1, "admin@kinetix.test", await bcrypt.hash(PASSWORD, 4), "admin"))
      const admins = await failuresCounted("password", "admin")
      const others = await failuresCounted("password", "other")

      await login("admin@kinetix.test", "wrong-password")
      await login("nobody@kinetix.test", "wrong-password")

      expect(await failuresCounted("password", "admin")).toBe(admins + 1)
      expect(await failuresCounted("password", "other")).toBe(others + 1)
    })
  })

  describe("a code checked while signed in", () => {
    it("is slowed by the same account counter, so a stolen token cannot strip the factor quickly", async () => {
      const pair = await harness.tokens.issuePair(
        { id: 4, email: "guarded@kinetix.test", role: "customer" },
        "p-4",
        null
      )
      const statuses: number[] = []

      for (let attempt = 0; attempt < 7; attempt++) {
        const response = await send({
          method: "POST",
          url: "/api/v1/auth/2fa/disable/4",
          headers: { authorization: `Bearer ${pair.accessToken}` },
          payload: { code: "000000", password: PASSWORD }
        })
        statuses.push(response.statusCode)
      }

      expect(statuses).toEqual([422, 422, 422, 422, 422, 429, 429])
    })
  })
})
