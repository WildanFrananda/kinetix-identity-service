import { Injectable } from "@nestjs/common"
import { InjectRepository } from "@nestjs/typeorm"
import { Repository } from "typeorm"
import MissingReferenceError from "../../../domain/errors/missing_reference.error"
import RecordConflictError from "../../../domain/errors/record_conflict.error"
import CourierApplicationRepositoryPort from "../../../domain/ports/courier_application_repository.port"
import type {
  ApplicationPage,
  ApplicationTally,
  ApplicationQuery,
  CourierApplicationStatus,
  CourierApplicationView,
  CourierFiling
} from "../../../types/application.type"
import CourierApplicationTypeormEntity from "../entities/courier_application_typeorm.entity"
import { isForeignKeyViolation, isUniqueViolation } from "../sql_state"

@Injectable()
class TypeormCourierApplicationRepositoryAdapter implements CourierApplicationRepositoryPort {
  constructor(
    @InjectRepository(CourierApplicationTypeormEntity)
    private readonly repo: Repository<CourierApplicationTypeormEntity>
  ) {}

  async recordFiled(filing: CourierFiling): Promise<CourierApplicationView> {
    const plate = filing.vehiclePlate.trim().toUpperCase()

    try {
      await this.repo.query(
        `INSERT INTO "courier_applications" ("userId", "principalId", "vehiclePlate", "capacityKg", "status")
         VALUES ($1, $2, $3, $4, 'pending')
         ON CONFLICT ("userId") DO UPDATE
           SET "principalId" = EXCLUDED."principalId",
               "vehiclePlate" = EXCLUDED."vehiclePlate",
               "capacityKg" = EXCLUDED."capacityKg",
               "filedAt" = CASE WHEN "courier_applications"."status" = 'rejected'
                 THEN now() ELSE "courier_applications"."filedAt" END,
               "rejectedAt" = CASE WHEN "courier_applications"."status" = 'rejected'
                 THEN NULL ELSE "courier_applications"."rejectedAt" END,
               "status" = CASE WHEN "courier_applications"."status" = 'rejected'
                 THEN 'pending' ELSE "courier_applications"."status" END`,
        [filing.userId, filing.principalId, plate, filing.capacityKg]
      )
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new MissingReferenceError(
          `No account ${filing.userId} with principal ${filing.principalId} to file a courier application for`
        )
      }
      if (isUniqueViolation(error)) {
        throw new RecordConflictError(`Vehicle plate ${plate} is already registered to another courier`)
      }
      throw error
    }

    const stored = await this.findByUser(filing.userId)
    if (!stored) {
      throw new Error(`courier application for account ${filing.userId} was not found after filing`)
    }

    return stored
  }

  async recordApproved(userId: number): Promise<CourierApplicationView | null> {
    const result = await this.repo
      .createQueryBuilder()
      .update(CourierApplicationTypeormEntity)
      .set({
        status: "approved",
        approvedAt: () => `COALESCE("approvedAt", now())`,
        rejectedAt: null
      })
      .where(`"userId" = :userId AND "status" IN ('pending', 'approved') AND "vehiclePlate" IS NOT NULL`, {
        userId
      })
      .execute()

    if ((result.affected ?? 0) === 0) {
      return null
    }

    return await this.findByUser(userId)
  }

  async recordRejected(userId: number): Promise<boolean> {
    const result = await this.repo
      .createQueryBuilder()
      .update(CourierApplicationTypeormEntity)
      .set({ status: "rejected", rejectedAt: () => "now()" })
      .where(`"userId" = :userId AND "status" = 'pending'`, { userId })
      .execute()

    return (result.affected ?? 0) > 0
  }

  async findByUser(userId: number): Promise<CourierApplicationView | null> {
    const record = await this.repo
      .createQueryBuilder("application")
      .innerJoinAndSelect("application.user", "account")
      .where("application.userId = :userId", { userId })
      .getOne()

    return record ? this.toView(record) : null
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

  async tally(since: Date): Promise<ApplicationTally> {
    const [row] = await this.repo.query(
      `SELECT
         count(*) FILTER (WHERE "status" = 'approved' AND "approvedAt" >= $1::timestamptz) AS "approved",
         count(*) FILTER (WHERE "status" = 'rejected' AND "rejectedAt" >= $1::timestamptz) AS "rejected"
       FROM "courier_applications"`,
      [since.toISOString()]
    )

    return { since: since.toISOString(), approved: Number(row.approved), rejected: Number(row.rejected) }
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
      vehiclePlate: record.vehiclePlate,
      capacityKg: Number(record.capacityKg),
      status: record.status,
      filedAt: record.filedAt.toISOString(),
      approvedAt: record.approvedAt ? record.approvedAt.toISOString() : null,
      rejectedAt: record.rejectedAt ? record.rejectedAt.toISOString() : null
    }
  }
}

export default TypeormCourierApplicationRepositoryAdapter
