import { ValidationPipe } from "@nestjs/common"
import { NestFactory } from "@nestjs/core"
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify"
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

  const port = Number(process.env.PORT) || 5000
  await app.listen(port, "0.0.0.0")
  console.log(`⚡ Kinetix Identity Service (NestJS + Fastify + Bun Runtime TS 5.5+) listening on port ${port}`)
}

bootstrap()
