import { ValidationPipe } from "@nestjs/common"
import type { NestFastifyApplication } from "@nestjs/platform-fastify"
import { requestIdMiddleware } from "../observability/request_id_middleware"
import { UnhandledExceptionFilter } from "../observability/unhandled_exception_filter"

function configureHttpPipeline(app: NestFastifyApplication): void {
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true
    })
  )

  app.use(requestIdMiddleware)
  app.useGlobalFilters(new UnhandledExceptionFilter())
}

export { configureHttpPipeline }
