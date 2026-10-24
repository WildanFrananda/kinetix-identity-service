import { ConflictException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common"
import MerchantVerificationEntity from "../../domain/entities/merchant_verification.entity"
import MerchantEntity from "../../domain/entities/merchant.entity"
import UserEntity from "../../domain/entities/user.entity"
import MerchantVerificationRepositoryPort from "../../domain/ports/merchant_verification_repository.port"
import MerchantRepositoryPort from "../../domain/ports/merchant_repository.port"
import UserRepositoryPort from "../../domain/ports/user_repository.port"
import OnboardSellerInputDto from "../dto/onboard_seller_input.dto"
import GeocodingUsecaseService from "./geocoding_usecase.service"
import PrincipalResolverService from "./principal_resolver.service"
import type {
  ApplicationPage,
  ApplicationQuery,
  ApprovedMerchant,
  SellerApplication,
  SellerApplicationStatus,
  SellerApplicationView
} from "../../types/application.type"

const MERCHANT_ALIAS_SERVICE = "identity-merchant"

const UNTOUCHED_BY_APPROVAL: ReadonlyArray<MerchantEntity["status"]> = ["active", "suspended"]

@Injectable()
class SellerOnboardingUsecaseService {
  private readonly logger = new Logger(SellerOnboardingUsecaseService.name)

  constructor(
    @Inject("MerchantVerificationRepositoryPort")
    private readonly verificationRepository: MerchantVerificationRepositoryPort,
    @Inject("MerchantRepositoryPort")
    private readonly merchantRepository: MerchantRepositoryPort,
    @Inject("UserRepositoryPort")
    private readonly userRepository: UserRepositoryPort,
    private readonly principalResolver: PrincipalResolverService,
    private readonly geocoding: GeocodingUsecaseService
  ) {}

  async onboardSeller(userId: number, dto: OnboardSellerInputDto): Promise<MerchantVerificationEntity> {
    const user: UserEntity | null = await this.userRepository.findById(userId)
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`)
    }

    this.requireMayBecomeSeller(user)

    const existing: MerchantVerificationEntity | null = await this.verificationRepository.findByUserId(userId)

    if (existing) {
      if (existing.status === "verified") {
        throw new ConflictException("This account is already a verified merchant")
      }

      existing.storeName = dto.storeName
      existing.businessRegistrationNumber = dto.businessRegistrationNumber
      existing.taxId = dto.taxId
      existing.streetAddress = dto.streetAddress
      existing.city = dto.city
      existing.postalCode = dto.postalCode
      existing.status = "pending"
      return await this.verificationRepository.save(existing)
    }

    const verification = new MerchantVerificationEntity(
      0,
      userId,
      dto.storeName,
      dto.businessRegistrationNumber,
      dto.taxId,
      "pending",
      undefined,
      dto.streetAddress,
      dto.city,
      dto.postalCode
    )

    return await this.verificationRepository.save(verification)
  }

  private async placeOnMap(merchant: MerchantEntity): Promise<void> {
    merchant.latitude = undefined
    merchant.longitude = undefined
    merchant.geocodedAt = new Date()

    if (merchant.streetAddress.trim().length === 0) {
      return
    }

    try {
      const outcome = await this.geocoding.geocode({
        streetAddress: merchant.streetAddress,
        city: merchant.city,
        postalCode: merchant.postalCode
      })

      if (outcome.geocoded) {
        merchant.latitude = outcome.location.latitude
        merchant.longitude = outcome.location.longitude
        return
      }

      this.logger.warn(
        `merchant ${merchant.userId}: the store address was approved but not placed ` +
          `(${outcome.failure}). No courier can be dispatched to it until it is geocoded.`
      )
    } catch (error) {
      this.logger.error(
        `merchant ${merchant.userId}: the store address was approved but the geocoder could not ` +
          `be asked: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  async applicationOf(userId: number): Promise<SellerApplication> {
    return await this.withPrincipal(await this.findApplication(userId))
  }

  private async findApplication(userId: number): Promise<MerchantVerificationEntity> {
    const verification: MerchantVerificationEntity | null = await this.verificationRepository.findByUserId(userId)
    if (!verification) {
      throw new NotFoundException(`No seller application found for User ID ${userId}`)
    }

    return verification
  }

  private async withPrincipal(verification: MerchantVerificationEntity): Promise<SellerApplication> {
    const principalId: string | null = await this.principalResolver.principalIdForUser(verification.userId)
    return { ...verification, principalId }
  }

  async listApplications(
    query: ApplicationQuery<SellerApplicationStatus>
  ): Promise<ApplicationPage<SellerApplicationView>> {
    return await this.verificationRepository.list(query)
  }

  async rejectVerification(userId: number): Promise<SellerApplication> {
    const verification: MerchantVerificationEntity = await this.pendingApplicationOf(userId)

    verification.status = "rejected"

    return await this.withPrincipal(await this.verificationRepository.save(verification))
  }

  async approveVerification(userId: number): Promise<ApprovedMerchant> {
    const verification: MerchantVerificationEntity = await this.pendingApplicationOf(userId)

    const user: UserEntity | null = await this.userRepository.findById(userId)
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`)
    }

    this.requireMayBecomeSeller(user)

    const verifiedAt = new Date()

    let merchant: MerchantEntity | null = await this.merchantRepository.findByUserId(userId)
    if (merchant && UNTOUCHED_BY_APPROVAL.includes(merchant.status)) {
      throw new ConflictException(
        `The merchant of account ${userId} is ${merchant.status}; an approval does not change that`
      )
    }

    if (!merchant) {
      merchant = new MerchantEntity(
        0,
        userId,
        verification.storeName,
        await this.uniqueSlug(verification.storeName, userId),
        verification.businessRegistrationNumber,
        verification.taxId,
        "verified",
        undefined,
        verifiedAt,
        verification.streetAddress,
        verification.city,
        verification.postalCode
      )
    } else {
      merchant.status = "verified"
      merchant.verifiedAt = verifiedAt
      merchant.streetAddress = verification.streetAddress
      merchant.city = verification.city
      merchant.postalCode = verification.postalCode
    }

    await this.placeOnMap(merchant)

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

    return { ...merchant, principalId }
  }

  private async pendingApplicationOf(userId: number): Promise<MerchantVerificationEntity> {
    const verification: MerchantVerificationEntity = await this.findApplication(userId)
    if (verification.status !== "pending") {
      throw new ConflictException(
        `The seller application of account ${userId} is ${verification.status}, not pending`
      )
    }

    return verification
  }

  private requireMayBecomeSeller(user: UserEntity): void {
    if (user.role === "customer" || user.role === "seller") {
      return
    }

    throw new ConflictException(
      `Account ${user.id} is a ${user.role}; making it a seller would revoke that role`
    )
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
