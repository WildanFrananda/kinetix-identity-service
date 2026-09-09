import { Logger } from "@nestjs/common"
import type { NestFastifyApplication } from "@nestjs/platform-fastify"
import { recordHttpRequest } from "./metrics_registry"
import { routeTemplateOf } from "./route_template"

const logger = new Logger("HttpMetrics")

function installHttpMetrics(app: NestFastifyApplication): void {
  app.getHttpAdapter()
    .getInstance()
    .addHook("onResponse", (request, reply, done): void => {
      try {
        recordHttpRequest({
          method: request.method,
          route: routeTemplateOf(request.routeOptions.url),
          status: reply.statusCode,
          durationSeconds: reply.elapsedTime / 1000
        })
      } catch (error: unknown) {
        logger.warn({
          message: "an HTTP request was served but could not be counted",
          fields: { reason: error instanceof Error ? error.message : String(error) }
        })
      }

      done()
    })
}

export { installHttpMetrics }
