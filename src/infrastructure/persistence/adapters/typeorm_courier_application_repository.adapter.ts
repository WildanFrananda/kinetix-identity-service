import { Injectable } from "@nestjs/common"
import { InjectRepository } from "@nestjs/typeorm"
import { Repository } from "typeorm"
import MissingReferenceError from "../../../domain/errors/missing_reference.error"
import CourierApplicationRepositoryPort from "../../../domain/ports/courier_application_repository.port"
import type {
  ApplicationPage,
  ApplicationQuery,
  CourierApplicationStatus,
  CourierApplicationView,
  CourierFiling
} from "../../../types/application.type"
import CourierApplicationTypeormEntity from "../entities/courier_application_typeorm.entity"
import { isForeignKeyViolation } from "../sql_state"

@Injectable()
class TypeormCourierApplicationRepositoryAdapter implements CourierApplicationRepositoryPort {
  constructor(
    @InjectRepository(CourierApplicationTypeormEntity)
    private readonly repo: Repository<CourierApplicationTypeormEntity>
  ) {}

  async recordFiled(filing: CourierFiling): Promise<void> {
    await this.write(
      filing,
      `INSERT INTO "courier_applications" ("userId", "principalId", "driverId", "status")
       VALUES ($1, $2, $3, 'pending')
       ON CONFLICT ("userId") DO UPDATE
         SET "principalId" = EXCLUDED."principalId",
             "driverId" = EXCLUDED."driverId"`
    )
  }

  async recordApproved(filing: CourierFiling): Promise<void> {
    await this.write(
      filing,
      `INSERT INTO "courier_applications" ("userId", "principalId", "driverId", "status", "approvedAt")
       VALUES ($1, $2, $3, 'approved', now())
       ON CONFLICT ("userId") DO UPDATE
         SET "principalId" = EXCLUDED."principalId",
             "driverId" = EXCLUDED."driverId",
             "status" = 'approved',
             "approvedAt" = COALESCE("courier_applications"."approvedAt", EXCLUDED."approvedAt")`
    )
  }

  async list(
    query: ApplicationQuery<CourierApplicationStatus>
  ): Promise<ApplicationPage<CourierApplicationView>> {
    const builder = this.repo
      .createQueryBuilder("application")
      .innerJoinAndSelect("application.user", "account")
      .where("application.id > :afterId", { afterId: query.afterId })
      .orderBy("application.id", "ASC")
      .limit(query.limit + 1)

    if (query.status !== null) {
      builder.andWhere("application.status = :status", { status: query.status })
    }

    const records = await builder.getMany()
    const hasMore = records.length > query.limit
    const page = hasMore ? records.slice(0, query.limit) : records

    return {
      applications: page.map((record) => this.toView(record)),
      nextAfterId: hasMore ? page[page.length - 1].id : null
    }
  }

  private async write(filing: CourierFiling, sql: string): Promise<void> {
    try {
      await this.repo.query(sql, [filing.userId, filing.principalId, filing.driverId])
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new MissingReferenceError(
          `No account ${filing.userId} with principal ${filing.principalId} to file a courier application for`
        )
      }
      throw error
    }
  }

  private toView(record: CourierApplicationTypeormEntity): CourierApplicationView {
    if (!record.user) {
      throw new Error(`courier application ${record.id} was read without its account`)
    }

    return {
      applicationId: record.id,
      principalId: record.principalId,
      userId: record.userId,
      email: record.user.email,
      driverId: record.driverId === null ? null : Number(record.driverId),
      status: record.status,
      filedAt: record.filedAt.toISOString(),
      approvedAt: record.approvedAt ? record.approvedAt.toISOString() : null
    }
  }
}

export default TypeormCourierApplicationRepositoryAdapter
