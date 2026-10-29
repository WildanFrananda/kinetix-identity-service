import { Injectable } from "@nestjs/common"
import { InjectRepository } from "@nestjs/typeorm"
import { In, Repository } from "typeorm"
import MerchantVerificationEntity from "../../../domain/entities/merchant_verification.entity"
import MissingReferenceError from "../../../domain/errors/missing_reference.error"
import RecordConflictError from "../../../domain/errors/record_conflict.error"
import MerchantVerificationRepositoryPort from "../../../domain/ports/merchant_verification_repository.port"
import type {
  ApplicationPage,
  ApplicationTally,
  ApplicationQuery,
  SellerApplicationStatus,
  SellerApplicationView
} from "../../../types/application.type"
import MerchantVerificationTypeormEntity from "../entities/merchant_verification_typeorm.entity"
import PrincipalAliasTypeormEntity from "../entities/principal_alias_typeorm.entity"
import { isForeignKeyViolation, isUniqueViolation } from "../sql_state"

@Injectable()
class TypeormMerchantVerificationRepositoryAdapter implements MerchantVerificationRepositoryPort {
  constructor(
    @InjectRepository(MerchantVerificationTypeormEntity)
    private readonly repo: Repository<MerchantVerificationTypeormEntity>
  ) {}

  async findByUserId(userId: number): Promise<MerchantVerificationEntity | null> {
    const record = await this.repo.findOne({ where: { userId } })
    return record ? this.toEntity(record) : null
  }

  async save(merchantVerification: MerchantVerificationEntity): Promise<MerchantVerificationEntity> {
    const entity = this.repo.create({
      id: merchantVerification.id > 0 ? merchantVerification.id : undefined,
      userId: merchantVerification.userId,
      storeName: merchantVerification.storeName,
      businessRegistrationNumber: merchantVerification.businessRegistrationNumber,
      taxId: merchantVerification.taxId,
      status: merchantVerification.status,
      verifiedAt: merchantVerification.verifiedAt,
      rejectedAt: merchantVerification.rejectedAt ?? null,
      streetAddress: merchantVerification.streetAddress,
      city: merchantVerification.city,
      postalCode: merchantVerification.postalCode
    })

    let saved: MerchantVerificationTypeormEntity
    try {
      saved = await this.repo.save(entity)
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new MissingReferenceError(`No account with ID ${merchantVerification.userId}`)
      }
      if (isUniqueViolation(error)) {
        throw new RecordConflictError(
          `A seller application for account ${merchantVerification.userId} was filed by another ` +
            "request at the same time; read it and retry"
        )
      }
      throw error
    }

    return this.toEntity(saved)
  }

  async list(
    query: ApplicationQuery<SellerApplicationStatus>
  ): Promise<ApplicationPage<SellerApplicationView>> {
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
    const principals = await this.principalsOf(page.map((record) => record.userId))

    return {
      applications: page.map((record) => ({
        applicationId: record.id,
        userId: record.userId,
        principalId: principals.get(String(record.userId)) ?? null,
        email: this.emailOf(record),
        storeName: record.storeName,
        businessRegistrationNumber: record.businessRegistrationNumber,
        taxId: record.taxId,
        streetAddress: record.streetAddress,
        city: record.city,
        postalCode: record.postalCode,
        status: record.status,
        verifiedAt: record.verifiedAt ? record.verifiedAt.toISOString() : null,
        rejectedAt: record.rejectedAt ? record.rejectedAt.toISOString() : null
      })),
      nextAfterId: hasMore ? page[page.length - 1].id : null
    }
  }

  async tally(since: Date): Promise<ApplicationTally> {
    const [row] = await this.repo.query(
      `SELECT
         count(*) FILTER (
           WHERE "status" = 'verified' AND ("verifiedAt" AT TIME ZONE 'UTC') >= $1::timestamptz
         ) AS "approved",
         count(*) FILTER (WHERE "status" = 'rejected' AND "rejectedAt" >= $1::timestamptz) AS "rejected"
       FROM "merchant_verifications"`,
      [since.toISOString()]
    )

    return { since: since.toISOString(), approved: Number(row.approved), rejected: Number(row.rejected) }
  }

  private async principalsOf(userIds: number[]): Promise<Map<string, string>> {
    if (userIds.length === 0) {
      return new Map()
    }

    const aliases = await this.repo.manager.getRepository(PrincipalAliasTypeormEntity).find({
      where: { service: "identity", localId: In(userIds.map(String)) }
    })

    return new Map(aliases.map((alias) => [alias.localId, alias.principalId]))
  }

  private emailOf(record: MerchantVerificationTypeormEntity): string {
    if (!record.user) {
      throw new Error(`seller application ${record.id} was read without its account`)
    }

    return record.user.email
  }

  private toEntity(record: MerchantVerificationTypeormEntity): MerchantVerificationEntity {
    return new MerchantVerificationEntity(
      record.id,
      record.userId,
      record.storeName,
      record.businessRegistrationNumber,
      record.taxId,
      record.status,
      record.verifiedAt,
      record.streetAddress,
      record.city,
      record.postalCode,
      record.rejectedAt ?? undefined
    )
  }
}

export default TypeormMerchantVerificationRepositoryAdapter
