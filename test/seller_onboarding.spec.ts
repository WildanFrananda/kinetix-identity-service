import MerchantVerificationEntity from "../src/domain/entities/merchant_verification.entity"
import MerchantEntity from "../src/domain/entities/merchant.entity"
import SellerOnboardingUsecaseService from "../src/application/services/seller_onboarding_usecase.service"

describe("SellerOnboardingUsecaseService Unit Tests", () => {
  let service: SellerOnboardingUsecaseService
  let mockVerificationRepo: any
  let mockMerchantRepo: any

  beforeEach(() => {
    mockVerificationRepo = {
      findByUserId: jest.fn(),
      save: jest.fn()
    }
    mockMerchantRepo = {
      findByUserId: jest.fn(),
      save: jest.fn()
    }

    service = new SellerOnboardingUsecaseService(mockVerificationRepo, mockMerchantRepo)
  })

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

  it("should approve pending seller verification and create active MerchantEntity", async () => {
    const pendingVerification = new MerchantVerificationEntity(1, 1, "Kinetix Store", "REG-100", "TAX-200", "pending")
    mockVerificationRepo.findByUserId.mockResolvedValue(pendingVerification)
    mockVerificationRepo.save.mockImplementation(async (v: MerchantVerificationEntity) => v)

    mockMerchantRepo.findByUserId.mockResolvedValue(null)
    mockMerchantRepo.save.mockImplementation(async (m: MerchantEntity) => m)

    const approvedMerchant = await service.approveVerification(1)

    expect(approvedMerchant.status).toBe("verified")
    expect(approvedMerchant.apiKey).toContain("KINETIX_MK_1_")
  })
})
