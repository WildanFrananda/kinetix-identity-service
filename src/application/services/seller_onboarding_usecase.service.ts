import { Inject, Injectable } from "@nestjs/common"
import MerchantVerificationEntity from "../../domain/entities/merchant_verification.entity"
import MerchantVerificationRepositoryPort from "../../domain/ports/merchant_verification_repository.port"
import OnboardSellerInputDto from "../dto/onboard_seller_input.dto"

@Injectable()
class SellerOnboardingUsecaseService {
  constructor(
    @Inject("MerchantVerificationRepositoryPort")
    private readonly verificationRepository: MerchantVerificationRepositoryPort
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
}

export default SellerOnboardingUsecaseService
