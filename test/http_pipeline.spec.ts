import { Controller, Get, Param } from "@nestjs/common"
import type { NestFastifyApplication } from "@nestjs/platform-fastify"
import { QueryFailedError } from "typeorm"
import AuthController from "../src/adapters/controllers/auth.controller"
import AuthUsecaseService from "../src/application/services/auth_usecase.service"
import MissingReferenceError from "../src/domain/errors/missing_reference.error"
import RecordConflictError from "../src/domain/errors/record_conflict.error"
import { httpApp, send } from "./support/http_app"
import { uniqueViolation } from "./support/sql_errors"

function withCode(message: string, code: string): Error {
  return Object.assign(new Error(message), { code })
}

const OUTAGES: Record<string, () => Error> = {
  refused: () => withCode("connect ECONNREFUSED 10.0.0.5:5432", "ECONNREFUSED"),
  "timed-out": () => withCode("connect ETIMEDOUT 10.0.0.5:5432", "ETIMEDOUT"),
  "too-many-clients": () => withCode("sorry, too many clients already", "53300"),
  "shutting-down": () => withCode("terminating connection due to administrator command", "57P01"),
  "connection-failure": () => new QueryFailedError("SELECT 1", [], withCode("connection failure", "08006")),
  severed: () => new QueryFailedError("SELECT 1", [], new Error("Connection terminated unexpectedly")),
  "pool-exhausted": () => new Error("timeout exceeded when trying to connect"),
  "every-address-refused": () =>
    new AggregateError([
      withCode("connect ECONNREFUSED ::1:5432", "ECONNREFUSED"),
      withCode("connect ECONNREFUSED 127.0.0.1:5432", "ECONNREFUSED")
    ])
}

@Controller("failures")
class FailuresController {
  @Get("crash")
  crash(): never {
    throw new Error("the database went away after the first write")
  }

  @Get("conflict")
  conflict(): never {
    throw new RecordConflictError("Email address is already registered")
  }

  @Get("missing")
  missing(): never {
    throw new MissingReferenceError("No account with ID 999")
  }

  @Get("outage/:kind")
  outage(@Param("kind") kind: string): never {
    throw OUTAGES[kind]()
  }

  @Get("untranslated-duplicate")
  untranslatedDuplicate(): never {
    throw uniqueViolation()
  }
}

describe("the HTTP pipeline", () => {
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

  it("answers no CORS preflight, so no web page is granted access by this service", async () => {
    const response = await send(app, {
      method: "OPTIONS",
      url: "/api/v1/auth/login",
      headers: {
        origin: "https://evil.example",
        "access-control-request-method": "POST"
      }
    })

    expect(response.headers["access-control-allow-origin"]).toBeUndefined()
    expect(response.headers["access-control-allow-methods"]).toBeUndefined()
  })

  it("sends no Access-Control-Allow-Origin on an ordinary response", async () => {
    const response = await send(app, {
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "someone@kinetix.test", password: "fixture-password" },
      headers: { origin: "https://evil.example" }
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers["access-control-allow-origin"]).toBeUndefined()
  })
})

describe("how a failure is answered", () => {
  let app: NestFastifyApplication

  beforeEach(async () => {
    app = await httpApp([FailuresController], [])
  })

  afterEach(async () => {
    await app.close()
  })

  it("does not claim that nothing changed when a request fails part-way", async () => {
    const response = await send(app, { method: "GET", url: "/failures/crash" })
    const body = response.json()

    expect(response.statusCode).toBe(500)
    expect(body.error).toBe("INTERNAL_ERROR")
    expect(body.message).not.toMatch(/no account, token or session was changed/i)
    expect(body.message).toMatch(/not known how much of it took effect/)
  })

  it("answers a write that lost a uniqueness race with 409", async () => {
    const response = await send(app, { method: "GET", url: "/failures/conflict" })

    expect(response.statusCode).toBe(409)
    expect(response.json().message).toBe("Email address is already registered")
  })

  it.each(Object.keys(OUTAGES))("answers a database that cannot be reached (%s) with 503", async (kind) => {
    const response = await send(app, { method: "GET", url: `/failures/outage/${kind}` })
    const body = response.json()

    expect(response.statusCode).toBe(503)
    expect(body.error).toBe("DATABASE_UNAVAILABLE")
    expect(typeof body.message).toBe("string")
    expect(Object.keys(body).sort()).toEqual(["error", "message", "traceId"])
  })

  it("does not take a constraint violation for an outage", async () => {
    const response = await send(app, { method: "GET", url: "/failures/untranslated-duplicate" })

    expect(response.statusCode).toBe(500)
  })

  it("answers a write that names a missing record with 404", async () => {
    const response = await send(app, { method: "GET", url: "/failures/missing" })

    expect(response.statusCode).toBe(404)
    expect(response.json().message).toBe("No account with ID 999")
  })
})
