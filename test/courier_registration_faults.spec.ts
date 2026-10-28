import {
  BadGatewayException,
  BadRequestException,
  HttpException,
  ServiceUnavailableException
} from "@nestjs/common"
import { Metadata, status } from "@grpc/grpc-js"
import type { ServiceError } from "@grpc/grpc-js"
import CourierOnboardingUsecaseService from "../src/application/services/courier_onboarding_usecase.service"
import CourierRegistrationUsecaseService from "../src/application/services/courier_registration_usecase.service"
import AuthTokenOutputDto from "../src/application/dto/auth_token_output.dto"
import UserEntity from "../src/domain/entities/user.entity"
import FleetRegistryGrpcAdapter from "../src/infrastructure/mesh/fleet_registry_grpc.adapter"
import type RegisterCourierInputDto from "../src/application/dto/register_courier_input.dto"
import type { CallContext } from "../src/types/call_context.type"

jest.mock("../src/infrastructure/mesh/contract_proto", () => {
  return {
    contractProto: (relative: string) => `/nonexistent/kinetix-contracts/${relative}`,
    contractProtoRoot: () => "/nonexistent/kinetix-contracts"
  }
})

const PRINCIPAL = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"

const INTERNAL_DETAIL = "peer spiffe://kinetix.internal/identity is not on matching's allow list"

const INPUT = {
  email: "driver@kinetix.test",
  password: "fixture-password-not-real",
  fullName: "Budi Santoso",
  phoneNumber: "081200000000",
  vehiclePlate: "B 1234 KIN",
  capacityKg: 150
} as RegisterCourierInputDto

const CONTEXT: CallContext = { requestId: "req-faults", client: { kind: "named", name: "courier-app" } }

function grpcError(code: status): ServiceError {
  return Object.assign(new Error(`${code} ${status[code]}: ${INTERNAL_DETAIL}`), {
    code,
    details: INTERNAL_DETAIL,
    metadata: new Metadata()
  })
}

function adapterAnswering(client: Record<string, unknown> | null): FleetRegistryGrpcAdapter {
  const adapter = new FleetRegistryGrpcAdapter({
    get: () => "kinetix-matching-service:50053"
  } as any)
  if (client !== null) {
    Object.assign(adapter, { client })
  }

  return adapter
}

function failingWith(error: ServiceError): Record<string, unknown> {
  function answer(_request: unknown, _metadata: unknown, _options: unknown, callback: Function): void {
    callback(error, undefined)
  }

  return { registerDriver: answer, activateDriver: answer }
}

function replyingWith(reply: Record<string, unknown>): Record<string, unknown> {
  function answer(_request: unknown, _metadata: unknown, _options: unknown, callback: Function): void {
    callback(null, reply)
  }

  return { registerDriver: answer, activateDriver: answer }
}

function registrationThrough(fleet: FleetRegistryGrpcAdapter): CourierRegistrationUsecaseService {
  const session = new AuthTokenOutputDto("access", "refresh", 900, {
    id: 7,
    email: INPUT.email,
    role: "customer",
    principalId: PRINCIPAL
  })

  return new CourierRegistrationUsecaseService(
    { register: jest.fn().mockResolvedValue(session) } as any,
    { updateProfile: jest.fn().mockResolvedValue(undefined) } as any,
    fleet,
    { findByEmail: jest.fn().mockResolvedValue(null) } as any,
    { recordFiled: jest.fn().mockResolvedValue(undefined) } as any
  )
}

async function refusalOf(work: Promise<unknown>): Promise<HttpException> {
  return await work.then(
    () => {
      throw new Error("the call was expected to be refused")
    },
    (error: HttpException) => error
  )
}

describe("courier registration when the fleet fails", () => {
  it.each([status.INVALID_ARGUMENT, status.PERMISSION_DENIED, status.UNAUTHENTICATED, status.UNIMPLEMENTED])(
    "answers gRPC %s as identity's fault (502), not as the courier's error",
    async (code) => {
      const service = registrationThrough(adapterAnswering(failingWith(grpcError(code))))

      const refusal = await refusalOf(service.register(INPUT, CONTEXT))

      expect(refusal).toBeInstanceOf(BadGatewayException)
      const body = refusal.getResponse() as Record<string, unknown>
      expect(body.accountExists).toBe(true)
      expect(JSON.stringify(body)).not.toContain(INTERNAL_DETAIL)
      expect(JSON.stringify(body)).not.toMatch(/correct the vehicle/i)
    }
  )

  it("answers a fleet contract without the method as identity's fault (502)", async () => {
    const service = registrationThrough(adapterAnswering({}))

    const refusal = await refusalOf(service.register(INPUT, CONTEXT))

    expect(refusal).toBeInstanceOf(BadGatewayException)
    expect((refusal.getResponse() as Record<string, unknown>).accountExists).toBe(true)
  })

  it("answers a missing fleet contract as identity's fault (502), naming no path", async () => {
    const service = registrationThrough(adapterAnswering(null))

    const refusal = await refusalOf(service.register(INPUT, CONTEXT))

    expect(refusal).toBeInstanceOf(BadGatewayException)
    expect(JSON.stringify(refusal.getResponse())).not.toContain("/nonexistent")
  })

  it("answers the fleet's own refusal as the courier's error (400)", async () => {
    const service = registrationThrough(
      adapterAnswering(
        replyingWith({
          success: false,
          driver_id: 0,
          already_registered: false,
          error: { error_code: "BLANK_VEHICLE_PLATE", message: "vehicle_plate is required" }
        })
      )
    )

    const refusal = await refusalOf(service.register(INPUT, CONTEXT))

    expect(refusal).toBeInstanceOf(BadRequestException)
    const body = refusal.getResponse() as Record<string, unknown>
    expect(body.error).toBe("BLANK_VEHICLE_PLATE")
    expect(body.accountExists).toBe(true)
  })

  it("answers an unknown outcome as unavailable (503)", async () => {
    const service = registrationThrough(adapterAnswering(failingWith(grpcError(status.UNAVAILABLE))))

    const refusal = await refusalOf(service.register(INPUT, CONTEXT))

    expect(refusal).toBeInstanceOf(ServiceUnavailableException)
    expect((refusal.getResponse() as Record<string, unknown>).accountExists).toBe(true)
  })
})

describe("courier approval when the fleet fails", () => {
  function approvalThrough(fleet: FleetRegistryGrpcAdapter): CourierOnboardingUsecaseService {
    return new CourierOnboardingUsecaseService(
      {
        findById: jest.fn().mockResolvedValue(new UserEntity(7, INPUT.email, "hash", "customer")),
        save: jest.fn().mockImplementation(async (user: UserEntity) => user)
      } as any,
      {
        userIdForPrincipal: jest.fn().mockResolvedValue(7),
        syncKind: jest.fn().mockResolvedValue(undefined)
      } as any,
      fleet,
      {
        recordApproved: jest.fn().mockResolvedValue(undefined),
        findByUser: jest.fn().mockResolvedValue(null)
      } as any
    )
  }

  it("answers a fault 502 without passing the peer's text to the admin", async () => {
    const service = approvalThrough(adapterAnswering(failingWith(grpcError(status.PERMISSION_DENIED))))

    const refusal = await refusalOf(service.approveCourier(PRINCIPAL))

    expect(refusal).toBeInstanceOf(BadGatewayException)
    const body = refusal.getResponse() as Record<string, unknown>
    expect(body.error).toBe("FLEET_PERMISSION_DENIED")
    expect(JSON.stringify(body)).not.toContain(INTERNAL_DETAIL)
  })
})
