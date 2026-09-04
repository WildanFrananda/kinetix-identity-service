import MerchantVerificationEntity from "../src/domain/entities/merchant_verification.entity"
import MerchantEntity from "../src/domain/entities/merchant.entity"
import UserEntity from "../src/domain/entities/user.entity"
import SellerOnboardingUsecaseService from "../src/application/services/seller_onboarding_usecase.service"

describe("SellerOnboardingUsecaseService Unit Tests", () => {
  let service: SellerOnboardingUsecaseService
  let mockVerificationRepo: any
  let mockMerchantRepo: any
  let mockUserRepo: any
  let mockPrincipalResolver: any
  let user: UserEntity

  beforeEach(() => {
    user = new UserEntity(1, "seller@kinetix.test", "hash", "customer")

    mockVerificationRepo = { findByUserId: jest.fn(), save: jest.fn() }
    mockMerchantRepo = { findByUserId: jest.fn(), findBySlug: jest.fn().mockResolvedValue(null), save: jest.fn() }
    mockUserRepo = {
      findById: jest.fn().mockResolvedValue(user),
      findByEmail: jest.fn(),
      save: jest.fn().mockImplementation(async (u: UserEntity) => u)
    }
    mockPrincipalResolver = {
      resolveOrMintForUser: jest.fn().mockResolvedValue("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"),
      syncKind: jest.fn().mockResolvedValue(undefined),
      registerAlias: jest.fn().mockResolvedValue(undefined)
    }

    service = new SellerOnboardingUsecaseService(
      mockVerificationRepo,
      mockMerchantRepo,
      mockUserRepo,
      mockPrincipalResolver
    )
  })

  function pending(): MerchantVerificationEntity {
    return new MerchantVerificationEntity(1, 1, "Kinetix Store", "REG-100", "TAX-200", "pending")
  }

  it("should create a pending merchant verification", async () => {
    mockVerificationRepo.findByUserId.mockResolvedValue(null)
    mockVerificationRepo.save.mockImplementation(async (v: MerchantVerificationEntity) => v)

    const res = await service.onboardSeller(1, {
      storeName: "Kinetix Store",
      businessRegistrationNumber: "REG-100",
      taxId: "TAX-200"
    })

    expect(res.status).toBe("pending")
    expect(res.storeName).toBe("Kinetix Store")
  })

  it("should refuse a re-submission from an account that is already verified", async () => {
    const verified = pending()
    verified.status = "verified"
    mockVerificationRepo.findByUserId.mockResolvedValue(verified)

    await expect(
      service.onboardSeller(1, { storeName: "Different Name", businessRegistrationNumber: "REG-999", taxId: "TAX-999" })
    ).rejects.toThrow("already a verified merchant")
    expect(mockVerificationRepo.save).not.toHaveBeenCalled()
  })

  it("should approve pending seller verification and create active MerchantEntity without API Key", async () => {
    mockVerificationRepo.findByUserId.mockResolvedValue(pending())
    mockVerificationRepo.save.mockImplementation(async (v: MerchantVerificationEntity) => v)
    mockMerchantRepo.findByUserId.mockResolvedValue(null)
    mockMerchantRepo.save.mockImplementation(async (m: MerchantEntity) => new MerchantEntity(
      7, m.userId, m.storeName, m.slug, m.businessRegistrationNumber, m.taxId, m.status, m.description, m.verifiedAt
    ))

    const approved = await service.approveVerification(1)

    expect(approved.status).toBe("verified")
    expect(approved.storeName).toBe("Kinetix Store")
  })

  it("should promote the account to seller on approval", async () => {
    mockVerificationRepo.findByUserId.mockResolvedValue(pending())
    mockVerificationRepo.save.mockImplementation(async (v: MerchantVerificationEntity) => v)
    mockMerchantRepo.findByUserId.mockResolvedValue(null)
    mockMerchantRepo.save.mockImplementation(async (m: MerchantEntity) => new MerchantEntity(
      7, m.userId, m.storeName, m.slug, m.businessRegistrationNumber, m.taxId, m.status, m.description, m.verifiedAt
    ))

    await service.approveVerification(1)

    expect(user.role).toBe("seller")
    expect(mockUserRepo.save).toHaveBeenCalled()
    expect(mockPrincipalResolver.syncKind).toHaveBeenCalledWith("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", "seller")
  })

  it("should alias the merchant row id to the same principal as the account", async () => {
    mockVerificationRepo.findByUserId.mockResolvedValue(pending())
    mockVerificationRepo.save.mockImplementation(async (v: MerchantVerificationEntity) => v)
    mockMerchantRepo.findByUserId.mockResolvedValue(null)
    mockMerchantRepo.save.mockImplementation(async (m: MerchantEntity) => new MerchantEntity(
      7, m.userId, m.storeName, m.slug, m.businessRegistrationNumber, m.taxId, m.status, m.description, m.verifiedAt
    ))

    await service.approveVerification(1)

    expect(mockPrincipalResolver.registerAlias).toHaveBeenCalledWith(
      "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      "identity-merchant",
      "7"
    )
  })

  it("should not mark the verification verified if minting the principal fails", async () => {
    const verification = pending()
    mockVerificationRepo.findByUserId.mockResolvedValue(verification)
    mockVerificationRepo.save.mockImplementation(async (v: MerchantVerificationEntity) => v)
    mockMerchantRepo.findByUserId.mockResolvedValue(null)
    mockMerchantRepo.save.mockImplementation(async (m: MerchantEntity) => new MerchantEntity(
      7, m.userId, m.storeName, m.slug, m.businessRegistrationNumber, m.taxId, m.status, m.description, m.verifiedAt
    ))
    mockPrincipalResolver.registerAlias.mockRejectedValue(new Error("alias collision"))

    await expect(service.approveVerification(1)).rejects.toThrow("alias collision")
    expect(verification.status).toBe("pending")
  })

  it("should not collide when two stores share a name", async () => {
    mockVerificationRepo.findByUserId.mockResolvedValue(pending())
    mockVerificationRepo.save.mockImplementation(async (v: MerchantVerificationEntity) => v)
    mockMerchantRepo.findByUserId.mockResolvedValue(null)
    mockMerchantRepo.findBySlug.mockResolvedValue(
      new MerchantEntity(99, 42, "Kinetix Store", "kinetix-store", "R", "T", "verified", "", new Date())
    )
    mockMerchantRepo.save.mockImplementation(async (m: MerchantEntity) => m)

    const approved = await service.approveVerification(1)

    expect(approved.slug).toBe("kinetix-store-1")
  })
})
