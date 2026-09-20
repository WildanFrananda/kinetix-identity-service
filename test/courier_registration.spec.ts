import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
  UnauthorizedException
} from "@nestjs/common"
import CourierRegistrationUsecaseService from "../src/application/services/courier_registration_usecase.service"
import AuthTokenOutputDto from "../src/application/dto/auth_token_output.dto"
import FleetRegistryError from "../src/domain/errors/fleet_registry.error"
import UserEntity from "../src/domain/entities/user.entity"
import type RegisterCourierInputDto from "../src/application/dto/register_courier_input.dto"

const PRINCIPAL = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"

function input(overrides: Partial<RegisterCourierInputDto> = {}): RegisterCourierInputDto {
  return {
    email: "driver@kinetix.test",
    password: "fixture-password-not-real",
    fullName: "Budi Santoso",
    phoneNumber: "081200000000",
    vehiclePlate: "B 1234 KIN",
    capacityKg: 150,
    ...overrides
  } as RegisterCourierInputDto
}

function session(): AuthTokenOutputDto {
  return new AuthTokenOutputDto("access", "refresh", 900, {
    id: 7,
    email: "driver@kinetix.test",
    role: "customer",
    principalId: PRINCIPAL
  })
}

describe("CourierRegistrationUsecaseService Unit Tests", () => {
  let service: CourierRegistrationUsecaseService
  let mockAuth: any
  let mockProfile: any
  let mockFleet: any
  let mockUserRepo: any

  beforeEach(() => {
    mockAuth = {
      register: jest.fn().mockResolvedValue(session()),
      login: jest.fn().mockResolvedValue(session())
    }
    mockProfile = {
      updateProfile: jest.fn().mockResolvedValue(undefined)
    }
    mockFleet = {
      registerDriver: jest.fn().mockResolvedValue({ driverId: 42, alreadyRegistered: false }),
      activateDriver: jest.fn()
    }
    mockUserRepo = {
      findByEmail: jest.fn().mockResolvedValue(null),
      findById: jest.fn(),
      save: jest.fn()
    }

    service = new CourierRegistrationUsecaseService(
      mockAuth,
      mockProfile,
      mockFleet,
      mockUserRepo
    )
  })

  describe("a new applicant", () => {
    it("creates the account, records the person, and files the vehicle", async () => {
      const res = await service.register(input())

      expect(mockAuth.register).toHaveBeenCalled()
      expect(mockProfile.updateProfile).toHaveBeenCalled()
      expect(mockFleet.registerDriver).toHaveBeenCalled()
      expect(res.driverId).toBe(42)
      expect(res.accessToken).toBe("access")
    })

    it("does not claim to know whether the driver may work", async () => {
      const res: Record<string, unknown> = { ...(await service.register(input())) }

      expect(Object.keys(res)).not.toContain("active")
    })

    it("sends the name and phone number to this service, never to the fleet", async () => {
      await service.register(input())

      expect(mockProfile.updateProfile).toHaveBeenCalledWith(7, {
        fullName: "Budi Santoso",
        phoneNumber: "081200000000"
      })

      const filed = mockFleet.registerDriver.mock.calls[0][0]
      expect(Object.keys(filed).sort()).toEqual(["capacityKg", "principalId", "vehiclePlate"])
      expect(JSON.stringify(filed)).not.toContain("Budi")
      expect(JSON.stringify(filed)).not.toContain("081200000000")
    })

    it("never sends the password anywhere but this service", async () => {
      await service.register(input())

      expect(JSON.stringify(mockFleet.registerDriver.mock.calls)).not.toContain("fixture-password-not-real")
      expect(JSON.stringify(mockProfile.updateProfile.mock.calls)).not.toContain("fixture-password-not-real")
    })

    it("files the vehicle against the principal the session names", async () => {
      await service.register(input())

      expect(mockFleet.registerDriver).toHaveBeenCalledWith(
        expect.objectContaining({ principalId: PRINCIPAL, vehiclePlate: "B 1234 KIN", capacityKg: 150 })
      )
    })
  })

  describe("a second attempt after the fleet call failed", () => {
    beforeEach(() => {
      mockUserRepo.findByEmail.mockResolvedValue(
        new UserEntity(7, "driver@kinetix.test", "hash", "customer")
      )
    })

    it("signs the account in and carries on, rather than refusing the email", async () => {
      const res = await service.register(input())

      expect(mockAuth.login).toHaveBeenCalled()
      expect(mockAuth.register).not.toHaveBeenCalled()
      expect(mockFleet.registerDriver).toHaveBeenCalled()
      expect(res.driverId).toBe(42)
    })

    it("succeeds when the vehicle turns out to be filed already", async () => {
      mockFleet.registerDriver.mockResolvedValue({ driverId: 42, alreadyRegistered: true })

      const res = await service.register(input())

      expect(res.driverId).toBe(42)
    })

    it("refuses when the password does not match the account that holds that email", async () => {
      mockAuth.login.mockRejectedValue(new UnauthorizedException("Invalid email or password"))

      await expect(service.register(input())).rejects.toBeInstanceOf(ConflictException)
      expect(mockFleet.registerDriver).not.toHaveBeenCalled()
    })

    it("refuses to resume an account with two-factor enabled", async () => {
      mockAuth.login.mockResolvedValue({ mfaRequired: true, challengeToken: "c", expiresIn: 300 })

      await expect(service.register(input())).rejects.toBeInstanceOf(ConflictException)
      expect(mockFleet.registerDriver).not.toHaveBeenCalled()
    })
  })

  describe("when the fleet refuses", () => {
    it("reports a correctable refusal as a bad request", async () => {
      mockFleet.registerDriver.mockRejectedValue(
        new FleetRegistryError({
          kind: "refused",
          code: "NO_CAPACITY",
          message: "capacity_kg must be greater than zero"
        })
      )

      await expect(service.register(input())).rejects.toBeInstanceOf(BadRequestException)
    })

    it("reports an unknown outcome as unavailable, so the applicant retries", async () => {
      mockFleet.registerDriver.mockRejectedValue(
        new FleetRegistryError({
          kind: "unknown",
          code: "FLEET_DEADLINE_EXCEEDED",
          message: "no answer"
        })
      )

      await expect(service.register(input())).rejects.toBeInstanceOf(ServiceUnavailableException)
    })

    it("leaves the account alone, whichever way the fleet failed", async () => {
      for (const kind of ["refused", "unknown"] as const) {
        jest.clearAllMocks()
        mockUserRepo.findByEmail.mockResolvedValue(null)
        mockAuth.register.mockResolvedValue(session())
        mockFleet.registerDriver.mockRejectedValue(
          new FleetRegistryError({ kind, code: "X", message: "y" })
        )

        await expect(service.register(input())).rejects.toBeTruthy()

        expect(mockUserRepo.save).not.toHaveBeenCalled()
        expect(Object.keys(mockUserRepo)).not.toContain("delete")
      }
    })
  })
})
