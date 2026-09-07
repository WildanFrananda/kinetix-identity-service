import { Logger, ValidationPipe } from "@nestjs/common"
import { NestFactory } from "@nestjs/core"
import { ReflectionService } from "@grpc/reflection"
import { MicroserviceOptions, Transport } from "@nestjs/microservices"
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify"
import { dirname, join } from "path"
import AppModule from "./app.module"
import { loadServiceIdentity, meshServerCredentials } from "./infrastructure/mesh/service_identity"
import {
  allowedCallers,
  peerAuthorizationInterceptor
} from "./infrastructure/mesh/peer_authorization_interceptor"
import { logLevelsFrom } from "./infrastructure/observability/log_levels"
import { requestIdInterceptor } from "./infrastructure/observability/request_id_interceptor"
import { requestIdMiddleware } from "./infrastructure/observability/request_id_middleware"
import { UnhandledExceptionFilter } from "./infrastructure/observability/unhandled_exception_filter"

function contractProto(relative: string): string {
  const manifest = require.resolve("kinetix-contracts/package.json")
  return join(dirname(manifest), "proto", relative)
}

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    { logger: logLevelsFrom(process.env.LOG_LEVEL) }
  )

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true
    })
  )

  app.use(requestIdMiddleware)
  app.useGlobalFilters(new UnhandledExceptionFilter())

  app.enableCors()

  const grpcPort = process.env.GRPC_PORT
  if (!grpcPort) {
    throw new Error("GRPC_PORT must be set")
  }

  const identity = loadServiceIdentity()
  const allowed = allowedCallers()

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: "identity.v1",
      protoPath: contractProto("identity/v1/identity.proto"),
      loader: {
        keepCase: true
      },
      url: `0.0.0.0:${grpcPort}`,
      credentials: meshServerCredentials(identity),
      channelOptions: {
        interceptors: [peerAuthorizationInterceptor(allowed), requestIdInterceptor()]
      } as MicroserviceOptions["options"] extends { channelOptions?: infer C } ? C : never,
      onLoadPackageDefinition: (pkg, server) => {
        new ReflectionService(pkg).addToServer(server)
      }
    }
  })

  await app.startAllMicroservices()

  const port = Number(process.env.PORT) || 5000
  await app.listen(port, "0.0.0.0")
  new Logger("Bootstrap").log(
    `Kinetix identity is up. HTTP (Fastify) on :${port}, gRPC on :${grpcPort}`
  )
}

bootstrap()
