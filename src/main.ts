import { ValidationPipe } from "@nestjs/common"
import { NestFactory } from "@nestjs/core"
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

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: "identity.v1",
      protoPath: join(process.cwd(), "proto/identity/v1/identity_service.proto"),
      url: "0.0.0.0:50052"
    }
  })

  await app.startAllMicroservices()

  const port = Number(process.env.PORT) || 5000
  await app.listen(port, "0.0.0.0")
  console.log(`⚡ Kinetix Identity Service HTTP (Fastify :${port}) & gRPC Server (:50052) active`)
}

bootstrap()
