import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common"
import MerchantVerificationEntity from "../../domain/entities/merchant_verification.entity"
import MerchantEntity from "../../domain/entities/merchant.entity"
import UserEntity from "../../domain/entities/user.entity"
import MerchantVerificationRepositoryPort from "../../domain/ports/merchant_verification_repository.port"
import MerchantRepositoryPort from "../../domain/ports/merchant_repository.port"
import UserRepositoryPort from "../../domain/ports/user_repository.port"
import OnboardSellerInputDto from "../dto/onboard_seller_input.dto"
import PrincipalResolverService from "./principal_resolver.service"

const MERCHANT_ALIAS_SERVICE = "identity-merchant"

@Injectable()
class SellerOnboardingUsecaseService {
  constructor(
    @Inject("MerchantVerificationRepositoryPort")
    private readonly verificationRepository: MerchantVerificationRepositoryPort,
    @Inject("MerchantRepositoryPort")
    private readonly merchantRepository: MerchantRepositoryPort,
    @Inject("UserRepositoryPort")
    private readonly userRepository: UserRepositoryPort,
    private readonly principalResolver: PrincipalResolverService
  ) {}

  async onboardSeller(userId: number, dto: OnboardSellerInputDto): Promise<MerchantVerificationEntity> {
    const user: UserEntity | null = await this.userRepository.findById(userId)
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`)
    }

    const existing: MerchantVerificationEntity | null = await this.verificationRepository.findByUserId(userId)

    if (existing) {
      if (existing.status === "verified") {
        throw new ConflictException("This account is already a verified merchant")
      }
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

    const user: UserEntity | null = await this.userRepository.findById(userId)
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`)
    }

    const verifiedAt = new Date()

    let merchant: MerchantEntity | null = await this.merchantRepository.findByUserId(userId)
    if (!merchant) {
      merchant = new MerchantEntity(
        0,
        userId,
        verification.storeName,
        await this.uniqueSlug(verification.storeName, userId),
        verification.businessRegistrationNumber,
        verification.taxId,
        "verified",
        "Official Merchant Store",
        verifiedAt
      )
    } else {
      merchant.status = "verified"
      merchant.verifiedAt = verifiedAt
    }
    merchant = await this.merchantRepository.save(merchant)

    if (user.role !== "seller") {
      user.role = "seller"
      await this.userRepository.save(user)
    }

    const principalId: string = await this.principalResolver.resolveOrMintForUser(user)
    await this.principalResolver.syncKind(principalId, user.role)
    await this.principalResolver.registerAlias(principalId, MERCHANT_ALIAS_SERVICE, String(merchant.id))

    verification.status = "verified"
    verification.verifiedAt = verifiedAt
    await this.verificationRepository.save(verification)

    return merchant
  }

  private async uniqueSlug(storeName: string, userId: number): Promise<string> {
    const base: string =
      storeName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "merchant"

    const taken = await this.merchantRepository.findBySlug(base)
    if (!taken || taken.userId === userId) {
      return base
    }
    return `${base}-${userId}`
  }
}

export default SellerOnboardingUsecaseService
export { MERCHANT_ALIAS_SERVICE }
