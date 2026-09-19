import { ConflictException, NotFoundException, ServiceUnavailableException } from "@nestjs/common"
import FleetRegistryError from "../src/domain/errors/fleet_registry.error"
import UserEntity from "../src/domain/entities/user.entity"
import CourierOnboardingUsecaseService from "../src/application/services/courier_onboarding_usecase.service"

const PRINCIPAL = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"

describe("CourierOnboardingUsecaseService Unit Tests", () => {
  let service: CourierOnboardingUsecaseService
  let mockUserRepo: any
  let mockPrincipalResolver: any
  let mockFleet: any
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
    mockFleet = {
      registerDriver: jest.fn(),
      activateDriver: jest.fn().mockResolvedValue({ driverId: 42, alreadyActive: false })
    }

    service = new CourierOnboardingUsecaseService(mockUserRepo, mockPrincipalResolver, mockFleet)
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
      "driverId",
      "fleetActivated"
    ])
    expect(Object.values(res)).not.toContain("hash")
    expect(Object.values(res)).not.toContain("TOTPSECRET")
  })

  it("is idempotent: approving an existing courier restates the fact", async () => {
    user.role = "courier"

    const res = await service.approveCourier(PRINCIPAL)

    expect(res.role).toBe("courier")
    expect(mockUserRepo.save).not.toHaveBeenCalled()
  })

  it("activates the fleet row, so the driver can actually work", async () => {
    const res = await service.approveCourier(PRINCIPAL)

    expect(mockFleet.activateDriver).toHaveBeenCalledWith(PRINCIPAL)
    expect(res.driverId).toBe(42)
    expect(res.fleetActivated).toBe(true)
  })

  it("sets the role before telling the fleet, so a fleet failure leaves the honest state", async () => {
    const order: string[] = []
    mockUserRepo.save.mockImplementation(async (u: UserEntity) => {
      order.push("role")
      return u
    })
    mockFleet.activateDriver.mockImplementation(async () => {
      order.push("fleet")
      return { driverId: 42, alreadyActive: false }
    })

    await service.approveCourier(PRINCIPAL)

    expect(order).toEqual(["role", "fleet"])
  })

  it("reconciles the fleet when re-approving an account that is already a courier", async () => {
    user.role = "courier"
    mockFleet.activateDriver.mockResolvedValue({ driverId: 42, alreadyActive: true })

    const res = await service.approveCourier(PRINCIPAL)

    expect(mockFleet.activateDriver).toHaveBeenCalledWith(PRINCIPAL)
    expect(res.fleetActivated).toBe(true)
  })

  it("still approves an account with no vehicle filed, and says so", async () => {
    mockFleet.activateDriver.mockRejectedValue(
      new FleetRegistryError({
        kind: "refused",
        code: "NO_DRIVER_RECORD",
        message: "that principal has no vehicle in this fleet"
      })
    )

    const res = await service.approveCourier(PRINCIPAL)

    expect(res.role).toBe("courier")
    expect(res.driverId).toBeNull()
    expect(res.fleetActivated).toBe(false)
  })

  it("reports a fleet it could not reach, rather than claiming the driver is ready", async () => {
    mockFleet.activateDriver.mockRejectedValue(
      new FleetRegistryError({
        kind: "unknown",
        code: "FLEET_UNAVAILABLE",
        message: "no route to the fleet"
      })
    )

    await expect(service.approveCourier(PRINCIPAL)).rejects.toBeInstanceOf(
      ServiceUnavailableException
    )
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
