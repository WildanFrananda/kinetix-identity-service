import { Injectable } from "@nestjs/common"
import { InjectRepository } from "@nestjs/typeorm"
import { Repository } from "typeorm"
import MerchantEntity from "../../../domain/entities/merchant.entity"
import MerchantRepositoryPort from "../../../domain/ports/merchant_repository.port"
import MerchantTypeormEntity from "../entities/merchant_typeorm.entity"

@Injectable()
class TypeormMerchantRepositoryAdapter implements MerchantRepositoryPort {
  constructor(
    @InjectRepository(MerchantTypeormEntity)
    private readonly repo: Repository<MerchantTypeormEntity>
  ) {}

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
      record.apiKey,
      record.status,
      record.description,
      record.verifiedAt
    )
  }

  async findByApiKey(apiKey: string): Promise<MerchantEntity | null> {
    const record = await this.repo.findOne({ where: { apiKey } })
    if (!record) return null
    return new MerchantEntity(
      record.id,
      record.userId,
      record.storeName,
      record.slug,
      record.businessRegistrationNumber,
      record.taxId,
      record.apiKey,
      record.status,
      record.description,
      record.verifiedAt
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
      apiKey: merchant.apiKey,
      status: merchant.status,
      verifiedAt: merchant.verifiedAt
    })
    const saved = await this.repo.save(entity)
    return new MerchantEntity(
      saved.id,
      saved.userId,
      saved.storeName,
      saved.slug,
      saved.businessRegistrationNumber,
      saved.taxId,
      saved.apiKey,
      saved.status,
      saved.description,
      saved.verifiedAt
    )
  }
}

export default TypeormMerchantRepositoryAdapter
