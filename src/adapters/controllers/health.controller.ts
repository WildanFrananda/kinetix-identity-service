import { Controller, Get, HttpCode, HttpStatus, ServiceUnavailableException } from "@nestjs/common"
import { InjectDataSource } from "@nestjs/typeorm"
import { DataSource } from "typeorm"
import { Public } from "../decorators/auth.decorators"
import type { LivenessReport, ReadinessReport } from "../../types/health.type"

@Controller("health")
@Public()
class HealthController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  live(): LivenessReport {
    return { status: "ok", service: "kinetix-identity-service" }
  }

  @Get("ready")
  async ready(): Promise<ReadinessReport> {
    try {
      await this.dataSource.query("SELECT 1")
    } catch (error: unknown) {
      console.error(
        "readiness check failed:",
        error instanceof Error ? error.message : error
      )
      throw new ServiceUnavailableException({ status: "unavailable", database: "unreachable" })
    }

    return { status: "ok", database: "reachable" }
  }
}

export default HealthController
