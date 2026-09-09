import { Controller, Get, HttpStatus, Logger, Res } from "@nestjs/common"
import type { FastifyReply } from "fastify"
import { Public } from "../decorators/auth.decorators"
import { metricsRegistry } from "../../infrastructure/observability/metrics_registry"

const PLAIN_TEXT = "text/plain; charset=utf-8"

@Controller()
class MetricsController {
  private readonly logger = new Logger(MetricsController.name)

  @Public()
  @Get("metrics")
  async metrics(@Res() reply: FastifyReply): Promise<void> {
    let body: string
    try {
      body = await metricsRegistry.metrics()
    } catch (error: unknown) {
      this.logger.error({
        message: "the metrics registry could not be rendered",
        fields: { reason: error instanceof Error ? error.message : String(error) }
      })

      reply
        .status(HttpStatus.SERVICE_UNAVAILABLE)
        .header("Content-Type", PLAIN_TEXT)
        .header("Cache-Control", "no-store")
        .send("metrics could not be rendered; this is not a report of zero traffic\n")
      return
    }

    reply
      .status(HttpStatus.OK)
      .header("Content-Type", metricsRegistry.contentType)
      .header("Cache-Control", "no-store")
      .send(body)
  }
}

export default MetricsController
