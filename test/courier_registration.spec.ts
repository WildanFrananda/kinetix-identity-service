import {
  BadRequestException,
  ConflictException,
  UnauthorizedException
} from "@nestjs/common"
import CourierRegistrationUsecaseService from "../src/application/services/courier_registration_usecase.service"
import AuthTokenOutputDto from "../src/application/dto/auth_token_output.dto"
import RecordConflictError from "../src/domain/errors/record_conflict.error"
import UserEntity from "../src/domain/entities/user.entity"
import type RegisterCourierInputDto from "../src/application/dto/register_courier_input.dto"
import type { CallContext } from "../src/types/call_context.type"

const PRINCIPAL = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"

const CONTEXT: CallContext = { requestId: "req-courier", client: { kind: "named", name: "courier-app" } }

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
  let mockUserRepo: any
  let mockApplications: any

  beforeEach(() => {
    mockAuth = {
      register: jest.fn().mockResolvedValue(session()),
      login: jest.fn(),
      verifyPassword: jest.fn().mockResolvedValue(new UserEntity(7, "driver@kinetix.test", "hash", "customer")),
      startSession: jest.fn().mockResolvedValue(session())
    }
    mockProfile = {
      updateProfile: jest.fn().mockResolvedValue(undefined)
    }
    mockUserRepo = {
      findByEmail: jest.fn().mockResolvedValue(null),
      findById: jest.fn(),
      save: jest.fn()
    }
    mockApplications = {
      recordFiled: jest.fn().mockResolvedValue({
        applicationId: 3,
        principalId: PRINCIPAL,
        userId: 7,
        email: "driver@kinetix.test",
        vehiclePlate: "B 1234 KIN",
        capacityKg: 150,
        status: "pending",
        filedAt: "2026-10-28T08:00:00.000Z",
        approvedAt: null,
        rejectedAt: null
      }),
      recordApproved: jest.fn(),
      list: jest.fn()
    }

    service = new CourierRegistrationUsecaseService(
      mockAuth,
      mockProfile,
      mockUserRepo,
      mockApplications
    )
  })

  describe("a new applicant", () => {
    it("creates the account, records the person, and files the vehicle in identity", async () => {
      const res = await service.register(input(), CONTEXT)

      expect(mockAuth.register).toHaveBeenCalledWith(
        { email: "driver@kinetix.test", password: "fixture-password-not-real" },
        CONTEXT
      )
      expect(mockProfile.updateProfile).toHaveBeenCalled()
      expect(mockApplications.recordFiled).toHaveBeenCalledWith({
        userId: 7,
        principalId: PRINCIPAL,
        vehiclePlate: "B 1234 KIN",
        capacityKg: 150
      })
      expect(res.vehiclePlate).toBe("B 1234 KIN")
      expect(res.capacityKg).toBe(150)
      expect(res.accessToken).toBe("access")
    })

    it("does not claim to know whether the driver may work", async () => {
      const res: Record<string, unknown> = { ...(await service.register(input(), CONTEXT)) }

      expect(Object.keys(res)).not.toContain("active")
      expect(Object.keys(res)).not.toContain("driverId")
    })

    it("normalises the vehicle plate to upper-case and trims whitespace", async () => {
      const res = await service.register(input({ vehiclePlate: "  b 1234 kin " }), CONTEXT)

      expect(mockApplications.recordFiled).toHaveBeenCalledWith({
        userId: 7,
        principalId: PRINCIPAL,
        vehiclePlate: "B 1234 KIN",
        capacityKg: 150
      })
      expect(res.vehiclePlate).toBe("B 1234 KIN")
    })

    it("refuses a blank vehicle plate before creating the account", async () => {
      await expect(service.register(input({ vehiclePlate: "   " }), CONTEXT)).rejects.toBeInstanceOf(
        BadRequestException
      )
      expect(mockAuth.register).not.toHaveBeenCalled()
    })

    it("refuses a capacity that is not a positive integer up to 5000", async () => {
      await expect(service.register(input({ capacityKg: 0 }), CONTEXT)).rejects.toBeInstanceOf(
        BadRequestException
      )
      await expect(service.register(input({ capacityKg: 5001 }), CONTEXT)).rejects.toBeInstanceOf(
        BadRequestException
      )
      expect(mockAuth.register).not.toHaveBeenCalled()
    })

    it("looks the email up in lower case", async () => {
      await service.register(input({ email: "Driver@Kinetix.Test" }), CONTEXT)

      expect(mockUserRepo.findByEmail).toHaveBeenCalledWith("driver@kinetix.test")
    })
  })

  describe("a second attempt for an existing account", () => {
    beforeEach(() => {
      mockUserRepo.findByEmail.mockResolvedValue(
        new UserEntity(7, "driver@kinetix.test", "hash", "customer")
      )
    })

    it("signs the account in and files the vehicle, rather than refusing the email", async () => {
      const res = await service.register(input(), CONTEXT)

      expect(mockAuth.verifyPassword).toHaveBeenCalledWith(
        { email: "driver@kinetix.test", password: "fixture-password-not-real" },
        CONTEXT
      )
      expect(mockAuth.startSession).toHaveBeenCalledWith(expect.any(UserEntity), CONTEXT)
      expect(mockAuth.register).not.toHaveBeenCalled()
      expect(mockApplications.recordFiled).toHaveBeenCalled()
      expect(res.vehiclePlate).toBe("B 1234 KIN")
    })

    it("refuses when the password does not match the account that holds that email", async () => {
      mockAuth.verifyPassword.mockRejectedValue(new UnauthorizedException("Invalid email or password"))

      await expect(service.register(input(), CONTEXT)).rejects.toBeInstanceOf(ConflictException)
      expect(mockApplications.recordFiled).not.toHaveBeenCalled()
    })

    it("refuses to resume an account with two-factor enabled", async () => {
      mockAuth.verifyPassword.mockResolvedValue(
        new UserEntity(7, "driver@kinetix.test", "hash", "customer", true)
      )

      await expect(service.register(input(), CONTEXT)).rejects.toBeInstanceOf(ConflictException)
      expect(mockAuth.startSession).not.toHaveBeenCalled()
      expect(mockApplications.recordFiled).not.toHaveBeenCalled()
    })

    it.each([
      ["seller", "That account is a seller"],
      ["admin", "That account is an admin"]
    ] as const)(
      "refuses to file a vehicle under an account whose role is %s, even with its password",
      async (role, opening) => {
        mockAuth.verifyPassword.mockResolvedValue(new UserEntity(7, "driver@kinetix.test", "hash", role))

        const refusal: unknown = await service.register(input(), CONTEXT).catch(function (error: unknown) {
          return error
        })

        expect(refusal).toBeInstanceOf(ConflictException)
        expect((refusal as ConflictException).getResponse()).toEqual({
          statusCode: 409,
          error: "Conflict",
          message:
            `${opening}, and filing a vehicle under it would make it a courier. ` +
            "A courier registers with an account of its own."
        })
        expect(mockAuth.startSession).not.toHaveBeenCalled()
        expect(mockProfile.updateProfile).not.toHaveBeenCalled()
        expect(mockApplications.recordFiled).not.toHaveBeenCalled()
      }
    )

    it("resumes an account that is already a courier", async () => {
      mockAuth.verifyPassword.mockResolvedValue(new UserEntity(7, "driver@kinetix.test", "hash", "courier"))

      const res = await service.register(input(), CONTEXT)

      expect(res.vehiclePlate).toBe("B 1234 KIN")
    })
  })

  describe("when the vehicle plate belongs to another courier", () => {
    it("answers 409 VEHICLE_PLATE_TAKEN and says the account exists", async () => {
      mockApplications.recordFiled.mockRejectedValue(
        new RecordConflictError("Vehicle plate B 1234 KIN is already registered to another courier")
      )

      const refusal: ConflictException = await service.register(input(), CONTEXT).then(
        () => {
          throw new Error("the registration was expected to be refused")
        },
        (error: ConflictException) => error
      )

      expect(refusal).toBeInstanceOf(ConflictException)
      const body = refusal.getResponse() as Record<string, unknown>
      expect(body.error).toBe("VEHICLE_PLATE_TAKEN")
      expect(body.accountExists).toBe(true)
      expect(String(body.message)).toContain("Your account exists")
    })
  })
})
