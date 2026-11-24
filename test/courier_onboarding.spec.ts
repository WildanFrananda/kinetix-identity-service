import {
  ConflictException,
  NotFoundException
} from "@nestjs/common"
import UserEntity from "../src/domain/entities/user.entity"
import CourierOnboardingUsecaseService from "../src/application/services/courier_onboarding_usecase.service"
import type { CourierApplicationView } from "../src/types/application.type"

const PRINCIPAL = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"

function anApplication(
  status: "pending" | "approved" | "rejected",
  vehiclePlate: string | null = "B 1234 KIN"
): CourierApplicationView {
  return {
    applicationId: 3,
    principalId: PRINCIPAL,
    userId: 7,
    email: "driver@kinetix.test",
    vehiclePlate,
    capacityKg: 150,
    status,
    filedAt: "2026-10-28T08:00:00.000Z",
    approvedAt: status === "approved" ? "2026-10-28T09:00:00.000Z" : null,
    rejectedAt: status === "rejected" ? "2026-10-28T09:00:00.000Z" : null
  }
}

describe("CourierOnboardingUsecaseService Unit Tests", () => {
  let service: CourierOnboardingUsecaseService
  let mockUserRepo: any
  let mockPrincipalResolver: any
  let mockApplications: any
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

    mockApplications = {
      recordFiled: jest.fn(),
      recordApproved: jest.fn().mockResolvedValue(anApplication("approved")),
      recordRejected: jest.fn().mockResolvedValue(true),
      findByUser: jest.fn().mockResolvedValue(anApplication("pending")),
      list: jest.fn()
    }

    service = new CourierOnboardingUsecaseService(
      mockUserRepo,
      mockPrincipalResolver,
      mockApplications
    )
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

    expect(Object.keys(res)).toEqual([
      "principalId",
      "email",
      "role",
      "vehiclePlate",
      "capacityKg"
    ])
    expect(Object.values(res)).not.toContain("hash")
    expect(Object.values(res)).not.toContain("TOTPSECRET")
  })

  it("is idempotent: approving an existing courier restates the fact", async () => {
    user.role = "courier"
    mockApplications.findByUser.mockResolvedValue(anApplication("approved"))

    const res = await service.approveCourier(PRINCIPAL)

    expect(res.role).toBe("courier")
    expect(res.vehiclePlate).toBe("B 1234 KIN")
    expect(res.capacityKg).toBe(150)
    expect(mockUserRepo.save).not.toHaveBeenCalled()
  })

  it("records the approval on the application", async () => {
    await service.approveCourier(PRINCIPAL)

    expect(mockApplications.recordApproved).toHaveBeenCalledWith(7)
  })

  it("refuses an account with no vehicle filed and leaves it a customer", async () => {
    mockApplications.findByUser.mockResolvedValue(null)

    await expect(service.approveCourier(PRINCIPAL)).rejects.toBeInstanceOf(ConflictException)

    expect(user.role).toBe("customer")
    expect(mockUserRepo.save).not.toHaveBeenCalled()
    expect(mockApplications.recordApproved).not.toHaveBeenCalled()
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

  it("refuses to approve a rejected application and changes nothing", async () => {
    mockApplications.findByUser.mockResolvedValue(anApplication("rejected"))

    await expect(service.approveCourier(PRINCIPAL)).rejects.toBeInstanceOf(ConflictException)

    expect(user.role).toBe("customer")
    expect(mockUserRepo.save).not.toHaveBeenCalled()
    expect(mockApplications.recordApproved).not.toHaveBeenCalled()
  })

  it("leaves the account as customer if a rejection commits before approval", async () => {
    mockApplications.findByUser
      .mockResolvedValueOnce(anApplication("pending"))
      .mockResolvedValueOnce(anApplication("rejected"))
    mockApplications.recordApproved.mockResolvedValueOnce(null)

    await expect(service.approveCourier(PRINCIPAL)).rejects.toBeInstanceOf(ConflictException)

    expect(user.role).toBe("customer")
    expect(mockUserRepo.save).not.toHaveBeenCalled()
    expect(mockPrincipalResolver.syncKind).not.toHaveBeenCalled()
  })

  describe("rejection", () => {
    beforeEach(() => {
      mockApplications.findByUser
        .mockReset()
        .mockResolvedValueOnce(anApplication("pending"))
        .mockResolvedValueOnce(anApplication("rejected"))
    })

    it("rejects a pending application and answers it as it now stands", async () => {
      const rejected = await service.rejectCourier(PRINCIPAL)

      expect(mockApplications.recordRejected).toHaveBeenCalledWith(7)
      expect(rejected).toEqual(anApplication("rejected"))
    })

    it("leaves the account a customer", async () => {
      await service.rejectCourier(PRINCIPAL)

      expect(user.role).toBe("customer")
      expect(mockUserRepo.save).not.toHaveBeenCalled()
    })

    it("refuses an account whose approval began, since a rejection would leave the role", async () => {
      user.role = "courier"

      await expect(service.rejectCourier(PRINCIPAL)).rejects.toBeInstanceOf(ConflictException)
      expect(mockApplications.recordRejected).not.toHaveBeenCalled()
    })

    it("refuses a principal that names no account", async () => {
      mockPrincipalResolver.userIdForPrincipal.mockResolvedValue(null)

      await expect(service.rejectCourier(PRINCIPAL)).rejects.toBeInstanceOf(NotFoundException)
      expect(mockApplications.recordRejected).not.toHaveBeenCalled()
    })

    it("refuses an account that filed no application", async () => {
      mockApplications.findByUser.mockReset().mockResolvedValue(null)

      await expect(service.rejectCourier(PRINCIPAL)).rejects.toThrow(
        `No courier application is filed under principal ${PRINCIPAL}`
      )
      expect(mockApplications.recordRejected).not.toHaveBeenCalled()
    })

    it.each(["approved", "rejected"] as const)("refuses an application that is already %s", async (status) => {
      mockApplications.findByUser.mockReset().mockResolvedValue(anApplication(status))

      await expect(service.rejectCourier(PRINCIPAL)).rejects.toThrow(
        `The courier application of principal ${PRINCIPAL} is ${status}, not pending`
      )
      expect(mockApplications.recordRejected).not.toHaveBeenCalled()
    })

    it("answers 409 when an approval decided the application first", async () => {
      mockApplications.findByUser
        .mockReset()
        .mockResolvedValueOnce(anApplication("pending"))
        .mockResolvedValueOnce(anApplication("approved"))
      mockApplications.recordRejected.mockResolvedValue(false)

      await expect(service.rejectCourier(PRINCIPAL)).rejects.toBeInstanceOf(ConflictException)
    })
  })
})
