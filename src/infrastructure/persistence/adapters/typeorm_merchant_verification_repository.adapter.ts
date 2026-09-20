import { Injectable } from "@nestjs/common"
import { InjectRepository } from "@nestjs/typeorm"
import { Repository } from "typeorm"
import MerchantVerificationEntity from "../../../domain/entities/merchant_verification.entity"
import MerchantVerificationRepositoryPort from "../../../domain/ports/merchant_verification_repository.port"
import MerchantVerificationTypeormEntity from "../entities/merchant_verification_typeorm.entity"

@Injectable()
class TypeormMerchantVerificationRepositoryAdapter implements MerchantVerificationRepositoryPort {
  constructor(
    @InjectRepository(MerchantVerificationTypeormEntity)
    private readonly repo: Repository<MerchantVerificationTypeormEntity>
  ) {}

  async findByUserId(userId: number): Promise<MerchantVerificationEntity | null> {
    const record = await this.repo.findOne({ where: { userId } })
    if (!record) return null
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
      record.postalCode
    )
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
      streetAddress: merchantVerification.streetAddress,
      city: merchantVerification.city,
      postalCode: merchantVerification.postalCode
    })
    const saved = await this.repo.save(entity)
    return new MerchantVerificationEntity(
      saved.id,
      saved.userId,
      saved.storeName,
      saved.businessRegistrationNumber,
      saved.taxId,
      saved.status,
      saved.verifiedAt,
      saved.streetAddress,
      saved.city,
      saved.postalCode
    )
  }
}

export default TypeormMerchantVerificationRepositoryAdapter
