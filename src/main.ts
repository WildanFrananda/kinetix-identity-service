import { ValidationPipe } from "@nestjs/common"
import { NestFactory } from "@nestjs/core"
import { ReflectionService } from "@grpc/reflection"
import { MicroserviceOptions, Transport } from "@nestjs/microservices"
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify"
import { join } from "path"
import AppModule from "./app.module"

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter()
  )

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true
    })
  )

  app.enableCors()

  const grpcPort = process.env.GRPC_PORT
  if (!grpcPort) {
    throw new Error("GRPC_PORT must be set")
  }

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: "identity.v1",
      protoPath: join(process.cwd(), "proto/identity/v1/identity_service.proto"),
      url: `0.0.0.0:${grpcPort}`,
      onLoadPackageDefinition: (pkg, server) => {
        new ReflectionService(pkg).addToServer(server)
      }
    }
  })

  await app.startAllMicroservices()

  const port = Number(process.env.PORT) || 5000
  await app.listen(port, "0.0.0.0")
  console.log(`⚡ Kinetix Identity Service HTTP (Fastify :${port}) & gRPC Server (:${grpcPort}) active`)
}

bootstrap()
