import { Logger, ValidationPipe } from "@nestjs/common"
import { NestFactory } from "@nestjs/core"
import { ReflectionService } from "@grpc/reflection"
import { MicroserviceOptions, Transport } from "@nestjs/microservices"
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify"
import { dirname, join } from "path"
import type { Server } from "@grpc/grpc-js"
import type { PackageDefinition } from "@grpc/proto-loader"
import AppModule from "./app.module"
import { loadServiceIdentity, meshServerCredentials } from "./infrastructure/mesh/service_identity"
import {
  allowedCallers,
  peerAuthorizationInterceptor
} from "./infrastructure/mesh/peer_authorization_interceptor"
import { SERVICE_NAME, SERVICE_VERSION } from "./infrastructure/observability/build_identity"
import { grpcMetricsInterceptor } from "./infrastructure/observability/grpc_metrics_interceptor"
import { grpcMethodPathsOf } from "./infrastructure/observability/grpc_method_paths"
import { installHttpMetrics } from "./infrastructure/observability/http_metrics"
import { JsonLogger } from "./infrastructure/observability/json_logger"
import { logLevelsFrom } from "./infrastructure/observability/log_levels"
import { declareGrpcMethod } from "./infrastructure/observability/metrics_registry"
import { requestIdInterceptor } from "./infrastructure/observability/request_id_interceptor"
import { requestIdMiddleware } from "./infrastructure/observability/request_id_middleware"
import {
  graceSecondsFrom,
  installShutdownDrain
} from "./infrastructure/observability/shutdown_drain"
import { UnhandledExceptionFilter } from "./infrastructure/observability/unhandled_exception_filter"

function contractProto(relative: string): string {
  const manifest = require.resolve("kinetix-contracts/package.json")
  return join(dirname(manifest), "proto", relative)
}

async function bootstrap() {
  const graceSeconds = graceSecondsFrom(process.env.SHUTDOWN_GRACE_SECONDS)

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    { logger: new JsonLogger(logLevelsFrom(process.env.LOG_LEVEL)) }
  )

  installHttpMetrics(app)

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

  let grpcServer: Server | null = null

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
        interceptors: [
          grpcMetricsInterceptor(),
          peerAuthorizationInterceptor(allowed),
          requestIdInterceptor()
        ]
      } as MicroserviceOptions["options"] extends { channelOptions?: infer C } ? C : never,
      onLoadPackageDefinition: (pkg: PackageDefinition, server: Server) => {
        grpcServer = server
        for (const path of grpcMethodPathsOf(pkg)) {
          declareGrpcMethod(path)
        }
        new ReflectionService(pkg).addToServer(server)
      }
    }
  })

  await app.startAllMicroservices()

  const port = Number(process.env.PORT) || 5000
  await app.listen(port, "0.0.0.0")

  installShutdownDrain({ app, grpcServer, graceSeconds })

  new Logger("Bootstrap").log({
    message: `Kinetix identity is up. HTTP (Fastify) on :${port}, gRPC on :${grpcPort}`,
    fields: {
      service: SERVICE_NAME,
      version: SERVICE_VERSION,
      http_port: port,
      grpc_port: grpcPort,
      grace_seconds: graceSeconds
    }
  })
}

bootstrap()
