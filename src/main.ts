import { Logger } from "@nestjs/common"
import { NestFactory } from "@nestjs/core"
import { ReflectionService } from "@grpc/reflection"
import { MicroserviceOptions, Transport } from "@nestjs/microservices"
import { NestFastifyApplication } from "@nestjs/platform-fastify"
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
import { contractProto, contractProtoRoot } from "./infrastructure/mesh/contract_proto"
import { logLevelsFrom } from "./infrastructure/observability/log_levels"
import { declareGrpcMethod } from "./infrastructure/observability/metrics_registry"
import { requestIdInterceptor } from "./infrastructure/observability/request_id_interceptor"
import {
  graceSecondsFrom,
  installShutdownDrain
} from "./infrastructure/observability/shutdown_drain"
import { createFastifyAdapter } from "./infrastructure/http/fastify_adapter"
import { configureHttpPipeline } from "./infrastructure/http/http_pipeline"
import { positiveIntegerSetting } from "./infrastructure/config/required_setting"

async function bootstrap() {
  const graceSeconds = graceSecondsFrom(process.env.SHUTDOWN_GRACE_SECONDS)
  const port = positiveIntegerSetting("PORT", process.env.PORT)

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    createFastifyAdapter(),
    { logger: new JsonLogger(logLevelsFrom(process.env.LOG_LEVEL)) }
  )

  installHttpMetrics(app)
  configureHttpPipeline(app)

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
      package: ["identity.v1", "geo.v1"],
      protoPath: [
        contractProto("identity/v1/identity.proto"),
        contractProto("geo/v1/geo.proto")
      ],
      loader: {
        keepCase: true,
        includeDirs: [contractProtoRoot()]
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
