import { Injectable } from "@nestjs/common"
import { InjectRepository } from "@nestjs/typeorm"
import { Repository } from "typeorm"
import MerchantEntity from "../../../domain/entities/merchant.entity"
import MerchantChange from "../../../domain/entities/merchant_change.entity"
import MerchantChangePage from "../../../domain/entities/merchant_change_page.entity"
import MissingReferenceError from "../../../domain/errors/missing_reference.error"
import RecordConflictError from "../../../domain/errors/record_conflict.error"
import MerchantRepositoryPort from "../../../domain/ports/merchant_repository.port"
import MerchantTypeormEntity from "../entities/merchant_typeorm.entity"
import { isForeignKeyViolation, isUniqueViolation } from "../sql_state"

@Injectable()
class TypeormMerchantRepositoryAdapter implements MerchantRepositoryPort {
  constructor(
    @InjectRepository(MerchantTypeormEntity)
    private readonly repo: Repository<MerchantTypeormEntity>
  ) {}

  async findById(id: number): Promise<MerchantEntity | null> {
    const record = await this.repo.findOne({ where: { id } })
    return record ? this.toEntity(record) : null
  }

  async findByUserId(userId: number): Promise<MerchantEntity | null> {
    const record = await this.repo.findOne({ where: { userId } })
    return record ? this.toEntity(record) : null
  }

  async findBySlug(slug: string): Promise<MerchantEntity | null> {
    const record = await this.repo.findOne({ where: { slug } })
    return record ? this.toEntity(record) : null
  }

  async findChangedSince(
    updatedThrough: Date | null,
    lastId: number,
    limit: number
  ): Promise<MerchantChangePage> {
    const query = this.repo
      .createQueryBuilder("merchant")
      .orderBy("merchant.updatedAt", "ASC")
      .addOrderBy("merchant.id", "ASC")
      .limit(limit + 1)

    if (updatedThrough) {
      query.where(
        "(merchant.updatedAt > :updatedThrough OR (merchant.updatedAt = :updatedThrough AND merchant.id > :lastId))",
        { updatedThrough, lastId }
      )
    }

    const records = await query.getMany()
    const hasMore = records.length > limit
    const page = hasMore ? records.slice(0, limit) : records

    return new MerchantChangePage(
      page.map((record) => new MerchantChange(this.toEntity(record), record.updatedAt)),
      hasMore
    )
  }

  async findChangedAfter(
    transactionId: string,
    lastId: number,
    limit: number
  ): Promise<MerchantChangePage> {
    const { entities, raw } = await this.repo
      .createQueryBuilder("merchant")
      .innerJoin("merchant_change_feed", "feed", "feed.merchant_id = merchant.id")
      .addSelect("feed.change_transaction_id::text", "change_transaction")
      .where("feed.change_transaction_id < pg_snapshot_xmin(pg_current_snapshot())")
      .andWhere(
        "(feed.change_transaction_id, merchant.id) > (CAST(:transactionId AS xid8), :lastId)",
        { transactionId, lastId }
      )
      .orderBy("feed.change_transaction_id", "ASC")
      .addOrderBy("merchant.id", "ASC")
      .limit(limit + 1)
      .getRawAndEntities<{ change_transaction: string }>()

    const hasMore = entities.length > limit
    const page = hasMore ? entities.slice(0, limit) : entities
    const last = page.length > 0 ? raw[page.length - 1].change_transaction : transactionId

    return new MerchantChangePage(
      page.map((record) => new MerchantChange(this.toEntity(record), record.updatedAt)),
      hasMore,
      last
    )
  }

  async save(merchant: MerchantEntity): Promise<MerchantEntity> {
    const entity = this.repo.create({
      id: merchant.id > 0 ? merchant.id : undefined,
      userId: merchant.userId,
      storeName: merchant.storeName,
      slug: merchant.slug,
      description: merchant.description ?? null,
      businessRegistrationNumber: merchant.businessRegistrationNumber,
      taxId: merchant.taxId,
      status: merchant.status,
      verifiedAt: merchant.verifiedAt,
      streetAddress: merchant.streetAddress,
      city: merchant.city,
      postalCode: merchant.postalCode,
      latitude: merchant.latitude ?? null,
      longitude: merchant.longitude ?? null,
      geocodedAt: merchant.geocodedAt ?? null
    })

    let saved: MerchantTypeormEntity
    try {
      saved = await this.repo.save(entity)
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new MissingReferenceError(`No account with ID ${merchant.userId}`)
      }
      if (isUniqueViolation(error)) {
        throw new RecordConflictError(
          `The merchant of account ${merchant.userId} or its store slug was written by another ` +
            "request at the same time; retry the approval"
        )
      }
      throw error
    }

    return this.toEntity(saved)
  }

  private toEntity(record: MerchantTypeormEntity): MerchantEntity {
    return new MerchantEntity(
      record.id,
      record.userId,
      record.storeName,
      record.slug,
      record.businessRegistrationNumber,
      record.taxId,
      record.status,
      record.description ?? undefined,
      record.verifiedAt,
      record.streetAddress,
      record.city,
      record.postalCode,
      record.latitude === null || record.latitude === undefined ? undefined : Number(record.latitude),
      record.longitude === null || record.longitude === undefined ? undefined : Number(record.longitude),
      record.geocodedAt ?? undefined
    )
  }
}

export default TypeormMerchantRepositoryAdapter
