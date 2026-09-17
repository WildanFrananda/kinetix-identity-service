import { ConflictException, NotFoundException } from "@nestjs/common"
import UserEntity from "../src/domain/entities/user.entity"
import CourierOnboardingUsecaseService from "../src/application/services/courier_onboarding_usecase.service"

const PRINCIPAL = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"

describe("CourierOnboardingUsecaseService Unit Tests", () => {
  let service: CourierOnboardingUsecaseService
  let mockUserRepo: any
  let mockPrincipalResolver: any
  let user: UserEntity

  beforeEach(() => {
    user = new UserEntity(7, "driver@kinetix.test", "hash", "customer")

    mockUserRepo = {
      findById: jest.fn().mockResolvedValue(user),
      findByEmail: jest.fn(),
      save: jest.fn().mockImplementation(async (u: UserEntity) => u)
    }
    mockPrincipalResolver = {
      userIdForPrincipal: jest.fn().mockResolvedValue(7),
      syncKind: jest.fn().mockResolvedValue(undefined)
    }

    service = new CourierOnboardingUsecaseService(mockUserRepo, mockPrincipalResolver)
  })

  it("promotes the account to courier so the driver socket will accept its token", async () => {
    const res = await service.approveCourier(PRINCIPAL)

    expect(res.role).toBe("courier")
    expect(mockUserRepo.save).toHaveBeenCalledWith(expect.objectContaining({ role: "courier" }))
  })

  it("syncs the principal kind, which is what other services read", async () => {
    await service.approveCourier(PRINCIPAL)

    expect(mockPrincipalResolver.syncKind).toHaveBeenCalledWith(PRINCIPAL, "courier")
  })

  it("never returns the password hash or the 2FA secret", async () => {
    user.twoFactorSecret = "TOTPSECRET"

    const res: Record<string, unknown> = { ...(await service.approveCourier(PRINCIPAL)) }

    expect(Object.keys(res)).toEqual(["principalId", "email", "role"])
    expect(Object.values(res)).not.toContain("hash")
    expect(Object.values(res)).not.toContain("TOTPSECRET")
  })

  it("is idempotent: approving an existing courier restates the fact", async () => {
    user.role = "courier"

    const res = await service.approveCourier(PRINCIPAL)

    expect(res.role).toBe("courier")
    expect(mockUserRepo.save).not.toHaveBeenCalled()
  })

  it("refuses to turn an admin into a courier", async () => {
    user.role = "admin"

    await expect(service.approveCourier(PRINCIPAL)).rejects.toBeInstanceOf(ConflictException)
    expect(mockUserRepo.save).not.toHaveBeenCalled()
  })

  it("refuses to turn a verified seller into a courier", async () => {
    user.role = "seller"

    await expect(service.approveCourier(PRINCIPAL)).rejects.toBeInstanceOf(ConflictException)
    expect(mockUserRepo.save).not.toHaveBeenCalled()
  })

  it("refuses a principal that names no account", async () => {
    mockPrincipalResolver.userIdForPrincipal.mockResolvedValue(null)

    await expect(service.approveCourier(PRINCIPAL)).rejects.toBeInstanceOf(NotFoundException)
  })

  it("refuses a principal whose account has since gone", async () => {
    mockUserRepo.findById.mockResolvedValue(null)

    await expect(service.approveCourier(PRINCIPAL)).rejects.toBeInstanceOf(NotFoundException)
  })
})
