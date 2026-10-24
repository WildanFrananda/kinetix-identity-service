import { generateKeyPairSync } from "crypto"
import { AddressInfo, createServer, Server, Socket, connect } from "net"
import { Reflector, APP_GUARD } from "@nestjs/core"
import { Test } from "@nestjs/testing"
import { ThrottlerModule } from "@nestjs/throttler"
import type { NestFastifyApplication } from "@nestjs/platform-fastify"
import { DataSource } from "typeorm"
import AuthController from "../src/adapters/controllers/auth.controller"
import JwtAuthGuard from "../src/adapters/guards/jwt_auth.guard"
import AuthUsecaseService from "../src/application/services/auth_usecase.service"
import ClientGateService from "../src/application/services/client_gate.service"
import TokenService from "../src/application/services/token.service"
import JwtKeyProvider from "../src/infrastructure/crypto/jwt_key_provider"
import { createFastifyAdapter } from "../src/infrastructure/http/fastify_adapter"
import { configureHttpPipeline } from "../src/infrastructure/http/http_pipeline"
import { DEFAULT_THROTTLE } from "../src/infrastructure/http/throttle_policy"
import PrincipalTypeormEntity from "../src/infrastructure/persistence/entities/principal_typeorm.entity"
import RefreshTokenTypeormEntity from "../src/infrastructure/persistence/entities/refresh_token_typeorm.entity"
import RevokedAccessTokenTypeormEntity from "../src/infrastructure/persistence/entities/revoked_access_token_typeorm.entity"
import { labClientGate } from "./support/client_gates"

const connectionString = process.env.KINETIX_TEST_POSTGRES

const describeWithDatabase = connectionString ? describe : describe.skip

class DatabaseLink {
  private readonly sockets = new Set<Socket>()
  private readonly server: Server

  constructor() {
    this.server = createServer((client) => {
      const upstream = connect(Number(process.env.DB_PORT), String(process.env.DB_HOST))
      this.sockets.add(client)
      this.sockets.add(upstream)
      client.on("error", () => upstream.destroy())
      upstream.on("error", () => client.destroy())
      client.pipe(upstream).pipe(client)
    })
  }

  async open(): Promise<number> {
    await new Promise<void>((resolve) => this.server.listen(0, "127.0.0.1", resolve))
    return (this.server.address() as AddressInfo).port
  }

  async cut(): Promise<void> {
    for (const socket of this.sockets) {
      socket.destroy()
    }
    await new Promise<void>((resolve) => this.server.close(() => resolve()))
  }
}

describeWithDatabase("identity's HTTP routes when the database cannot be reached", () => {
  let link: DatabaseLink
  let dataSource: DataSource
  let app: NestFastifyApplication
  let accessToken: string
  let tokens: TokenService

  beforeAll(async () => {
    const migrator: DataSource = (await import("../src/data-source")).default
    await migrator.initialize()
    await migrator.runMigrations()
    await migrator.destroy()
  }, 60000)

  async function start(poolSize: number): Promise<void> {
    link = new DatabaseLink()
    const port = await link.open()

    dataSource = new DataSource({
      type: "postgres",
      host: "127.0.0.1",
      port,
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE,
      entities: [PrincipalTypeormEntity, RefreshTokenTypeormEntity, RevokedAccessTokenTypeormEntity],
      connectTimeoutMS: 500,
      extra: { max: poolSize }
    })
    await dataSource.initialize()

    const privateKey = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" }
    }).privateKey
    const settings: Record<string, string> = {
      KINETIX_IDENTITY_JWT_PRIVATE_KEY_B64: Buffer.from(privateKey).toString("base64"),
      JWT_ISSUER: "https://identity.kinetix.test",
      JWT_AUDIENCE: "kinetix",
      JWT_ACCESS_TTL_SECONDS: "900",
      JWT_REFRESH_TTL_SECONDS: "2592000"
    }
    const config = { get: (name: string) => settings[name] } as any

    tokens = new TokenService(
      config,
      new JwtKeyProvider(config),
      dataSource.getRepository(RefreshTokenTypeormEntity),
      dataSource.getRepository(RevokedAccessTokenTypeormEntity)
    )

    const principal = await dataSource.getRepository(PrincipalTypeormEntity).save(
      dataSource.getRepository(PrincipalTypeormEntity).create({ kind: "PRINCIPAL_KIND_CUSTOMER" })
    )
    accessToken = (await tokens.issuePair({ id: 1, email: "o@kinetix.test", role: "customer" }, principal.id, null))
      .accessToken

    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([DEFAULT_THROTTLE])],
      controllers: [AuthController],
      providers: [
        { provide: AuthUsecaseService, useValue: {} },
        { provide: ClientGateService, useValue: labClientGate() },
        { provide: APP_GUARD, useValue: new JwtAuthGuard(tokens, new Reflector()) }
      ]
    }).compile()

    app = moduleRef.createNestApplication<NestFastifyApplication>(createFastifyAdapter(), { logger: false })
    configureHttpPipeline(app)
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
  }

  async function me(): Promise<{ statusCode: number; body: Record<string, unknown> }> {
    const response = await app.getHttpAdapter().getInstance().inject({
      method: "GET",
      url: "/api/v1/auth/me",
      remoteAddress: "172.18.0.4",
      headers: { authorization: `Bearer ${accessToken}` }
    })

    return { statusCode: response.statusCode, body: response.json() }
  }

  afterEach(async () => {
    await app?.close()
    if (dataSource?.isInitialized) {
      await dataSource.destroy().catch(() => undefined)
    }
    await link?.cut().catch(() => undefined)
  })

  it("answers a signed-in request 200 while the database is there", async () => {
    await start(2)

    expect((await me()).statusCode).toBe(200)
  }, 30000)

  it("answers 503, not 401 or 500, when the revocation lookup cannot reach the database", async () => {
    await start(2)
    await link.cut()

    const answer = await me()

    expect(answer.statusCode).toBe(503)
    expect(answer.body.error).toBe("DATABASE_UNAVAILABLE")
  }, 30000)

  it("answers 503 when every pooled connection is busy past the wait", async () => {
    await start(1)
    const holder = dataSource.query("SELECT pg_sleep(2)")

    const answer = await me()
    await holder

    expect(answer.statusCode).toBe(503)
    expect(answer.body.error).toBe("DATABASE_UNAVAILABLE")
  }, 30000)
})
