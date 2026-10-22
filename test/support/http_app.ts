import { CanActivate, ExecutionContext, Provider, Type } from "@nestjs/common"
import { APP_GUARD } from "@nestjs/core"
import { Test } from "@nestjs/testing"
import { ThrottlerModule } from "@nestjs/throttler"
import type { NestFastifyApplication } from "@nestjs/platform-fastify"
import type { InjectOptions, LightMyRequestResponse as InjectResponse } from "fastify"
import RolesGuard from "../../src/adapters/guards/roles.guard"
import SelfOrStaffGuard from "../../src/adapters/guards/self_or_staff.guard"
import { createFastifyAdapter } from "../../src/infrastructure/http/fastify_adapter"
import { configureHttpPipeline } from "../../src/infrastructure/http/http_pipeline"
import { DEFAULT_THROTTLE } from "../../src/infrastructure/http/throttle_policy"
import type { AccessClaims } from "../../src/types/token.type"

const GATEWAY_ADDRESS = "172.18.0.4"

const CALLER_HEADER = "x-test-caller"

class CallerFromHeaderGuard implements CanActivate {
  constructor(private readonly callers: Record<string, AccessClaims>) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>
      user?: AccessClaims
    }>()
    const name = request.headers[CALLER_HEADER]

    if (name !== undefined && this.callers[name] !== undefined) {
      request.user = this.callers[name]
    }

    return true
  }
}

function claimsFor(role: string, uid: number, sub: string): AccessClaims {
  return {
    sub,
    jti: `00000000-0000-4000-8000-${String(uid).padStart(12, "0")}`,
    iss: "https://identity.kinetix.test",
    aud: "kinetix",
    exp: Math.floor(Date.now() / 1000) + 900,
    iat: Math.floor(Date.now() / 1000),
    token_use: "access",
    uid,
    email: `${role}${uid}@kinetix.test`,
    role
  }
}

async function httpApp(
  controllers: Type<unknown>[],
  providers: Provider[],
  callers: Record<string, AccessClaims> = {}
): Promise<NestFastifyApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [ThrottlerModule.forRoot([DEFAULT_THROTTLE])],
    controllers,
    providers: [
      ...providers,
      RolesGuard,
      SelfOrStaffGuard,
      {
        provide: APP_GUARD,
        useValue: new CallerFromHeaderGuard(callers)
      }
    ]
  }).compile()

  const app = moduleRef.createNestApplication<NestFastifyApplication>(createFastifyAdapter(), {
    logger: false
  })
  configureHttpPipeline(app)
  await app.init()
  await app.getHttpAdapter().getInstance().ready()

  return app
}

async function send(app: NestFastifyApplication, options: InjectOptions): Promise<InjectResponse> {
  return await app.getHttpAdapter().getInstance().inject({
    remoteAddress: GATEWAY_ADDRESS,
    ...options
  })
}

export { CALLER_HEADER, GATEWAY_ADDRESS, claimsFor, httpApp, send }
