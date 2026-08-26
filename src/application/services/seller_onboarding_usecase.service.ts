import { Inject, Injectable, NotFoundException } from "@nestjs/common"
import MerchantVerificationEntity from "../../domain/entities/merchant_verification.entity"
import MerchantEntity from "../../domain/entities/merchant.entity"
import MerchantVerificationRepositoryPort from "../../domain/ports/merchant_verification_repository.port"
import MerchantRepositoryPort from "../../domain/ports/merchant_repository.port"
import OnboardSellerInputDto from "../dto/onboard_seller_input.dto"

@Injectable()
class SellerOnboardingUsecaseService {
  constructor(
    @Inject("MerchantVerificationRepositoryPort")
    private readonly verificationRepository: MerchantVerificationRepositoryPort,
    @Inject("MerchantRepositoryPort")
    private readonly merchantRepository: MerchantRepositoryPort
  ) {}

  async onboardSeller(userId: number, dto: OnboardSellerInputDto): Promise<MerchantVerificationEntity> {
    let existing: MerchantVerificationEntity | null = await this.verificationRepository.findByUserId(userId)

    if (existing) {
      existing.storeName = dto.storeName
      existing.businessRegistrationNumber = dto.businessRegistrationNumber
      existing.taxId = dto.taxId
      existing.status = "pending"
      return await this.verificationRepository.save(existing)
    }

    const verification = new MerchantVerificationEntity(
      0,
      userId,
      dto.storeName,
      dto.businessRegistrationNumber,
      dto.taxId,
      "pending"
    )

    return await this.verificationRepository.save(verification)
  }

  async approveVerification(userId: number): Promise<MerchantEntity> {
    const verification: MerchantVerificationEntity | null = await this.verificationRepository.findByUserId(userId)
    if (!verification) {
      throw new NotFoundException(`No pending seller verification found for User ID ${userId}`)
    }

    verification.status = "verified"
    verification.verifiedAt = new Date()
    await this.verificationRepository.save(verification)

    const slug: string = verification.storeName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")

    let merchant: MerchantEntity | null = await this.merchantRepository.findByUserId(userId)

    if (!merchant) {
      merchant = new MerchantEntity(
        0,
        userId,
        verification.storeName,
        slug,
        verification.businessRegistrationNumber,
        verification.taxId,
        "verified",
        "Official Merchant Store",
        verification.verifiedAt
      )
    } else {
      merchant.status = "verified"
      merchant.verifiedAt = verification.verifiedAt
    }

    return await this.merchantRepository.save(merchant)
  }
}

export default SellerOnboardingUsecaseService
