import { Injectable } from "@nestjs/common"
import { InjectRepository } from "@nestjs/typeorm"
import { Repository } from "typeorm"
import MerchantEntity from "../../../domain/entities/merchant.entity"
import MerchantChange from "../../../domain/entities/merchant_change.entity"
import MerchantChangePage from "../../../domain/entities/merchant_change_page.entity"
import MerchantRepositoryPort from "../../../domain/ports/merchant_repository.port"
import MerchantTypeormEntity from "../entities/merchant_typeorm.entity"

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
    if (!record) return null
    return new MerchantEntity(
      record.id,
      record.userId,
      record.storeName,
      record.slug,
      record.businessRegistrationNumber,
      record.taxId,
      record.status,
      record.description,
      record.verifiedAt,
      record.streetAddress,
      record.city,
      record.postalCode,
      record.latitude === null || record.latitude === undefined ? undefined : Number(record.latitude),
      record.longitude === null || record.longitude === undefined ? undefined : Number(record.longitude),
      record.geocodedAt
    )
  }

  async findBySlug(slug: string): Promise<MerchantEntity | null> {
    const record = await this.repo.findOne({ where: { slug } })
    if (!record) return null
    return new MerchantEntity(
      record.id,
      record.userId,
      record.storeName,
      record.slug,
      record.businessRegistrationNumber,
      record.taxId,
      record.status,
      record.description,
      record.verifiedAt,
      record.streetAddress,
      record.city,
      record.postalCode,
      record.latitude === null || record.latitude === undefined ? undefined : Number(record.latitude),
      record.longitude === null || record.longitude === undefined ? undefined : Number(record.longitude),
      record.geocodedAt
    )
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

  async save(merchant: MerchantEntity): Promise<MerchantEntity> {
    const entity = this.repo.create({
      id: merchant.id > 0 ? merchant.id : undefined,
      userId: merchant.userId,
      storeName: merchant.storeName,
      slug: merchant.slug,
      description: merchant.description,
      businessRegistrationNumber: merchant.businessRegistrationNumber,
      taxId: merchant.taxId,
      status: merchant.status,
      verifiedAt: merchant.verifiedAt
    ,
      streetAddress: merchant.streetAddress,
      city: merchant.city,
      postalCode: merchant.postalCode,
      latitude: merchant.latitude,
      longitude: merchant.longitude,
      geocodedAt: merchant.geocodedAt
    })
    const saved = await this.repo.save(entity)
    return new MerchantEntity(
      saved.id,
      saved.userId,
      saved.storeName,
      saved.slug,
      saved.businessRegistrationNumber,
      saved.taxId,
      saved.status,
      saved.description,
      saved.verifiedAt,
      saved.streetAddress,
      saved.city,
      saved.postalCode,
      saved.latitude === null || saved.latitude === undefined ? undefined : Number(saved.latitude),
      saved.longitude === null || saved.longitude === undefined ? undefined : Number(saved.longitude),
      saved.geocodedAt
    )
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
      record.description,
      record.verifiedAt,
      record.streetAddress,
      record.city,
      record.postalCode,
      record.latitude === null || record.latitude === undefined ? undefined : Number(record.latitude),
      record.longitude === null || record.longitude === undefined ? undefined : Number(record.longitude),
      record.geocodedAt
    )
  }
}

export default TypeormMerchantRepositoryAdapter
