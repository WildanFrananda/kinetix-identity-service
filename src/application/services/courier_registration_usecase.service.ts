import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException
} from "@nestjs/common"
import UserEntity from "../../domain/entities/user.entity"
import { normalisedEmail } from "../../domain/email_address"
import FleetRegistryError from "../../domain/errors/fleet_registry.error"
import CourierApplicationRepositoryPort from "../../domain/ports/courier_application_repository.port"
import FleetRegistryPort from "../../domain/ports/fleet_registry.port"
import UserRepositoryPort from "../../domain/ports/user_repository.port"
import AuthTokenOutputDto from "../dto/auth_token_output.dto"
import RegisterCourierInputDto from "../dto/register_courier_input.dto"
import RegisterCourierOutputDto from "../dto/register_courier_output.dto"
import AuthUsecaseService from "./auth_usecase.service"
import UserProfileUsecaseService from "./user_profile_usecase.service"
import type { CallContext } from "../../types/call_context.type"

const ROLES_THAT_MAY_DRIVE: ReadonlyArray<UserEntity["role"]> = ["customer", "courier"]

@Injectable()
class CourierRegistrationUsecaseService {
  private readonly logger = new Logger(CourierRegistrationUsecaseService.name)

  constructor(
    private readonly authUsecase: AuthUsecaseService,
    private readonly profileUsecase: UserProfileUsecaseService,
    @Inject("FleetRegistryPort")
    private readonly fleet: FleetRegistryPort,
    @Inject("UserRepositoryPort")
    private readonly userRepository: UserRepositoryPort,
    @Inject("CourierApplicationRepositoryPort")
    private readonly applications: CourierApplicationRepositoryPort
  ) {}

  async register(dto: RegisterCourierInputDto, context: CallContext): Promise<RegisterCourierOutputDto> {
    const session: AuthTokenOutputDto = await this.sessionFor(dto, context)

    await this.profileUsecase.updateProfile(session.user.id, {
      fullName: dto.fullName,
      phoneNumber: dto.phoneNumber
    })

    const driverId: number = await this.fileVehicle(session, dto)

    await this.applications.recordFiled({
      userId: session.user.id,
      principalId: session.user.principalId,
      driverId
    })

    return new RegisterCourierOutputDto(
      session.accessToken,
      session.refreshToken,
      session.expiresIn,
      session.user,
      driverId
    )
  }

  private async sessionFor(dto: RegisterCourierInputDto, context: CallContext): Promise<AuthTokenOutputDto> {
    const existing: UserEntity | null = await this.userRepository.findByEmail(normalisedEmail(dto.email))

    if (!existing) {
      return await this.authUsecase.register({ email: dto.email, password: dto.password }, context)
    }

    return await this.resume(dto, context)
  }

  private async resume(dto: RegisterCourierInputDto, context: CallContext): Promise<AuthTokenOutputDto> {
    let account: UserEntity

    try {
      account = await this.authUsecase.verifyPassword({ email: dto.email, password: dto.password }, context)
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw new ConflictException("An account with that email address already exists")
      }
      throw error
    }

    if (!ROLES_THAT_MAY_DRIVE.includes(account.role)) {
      throw new ConflictException(
        `That account is a ${account.role}, and filing a vehicle under it would make it a courier. ` +
          "A courier registers with an account of its own."
      )
    }

    if (account.isTwoFactorEnabled) {
      throw new ConflictException(
        "That account has two-factor authentication enabled, so registration cannot be resumed " +
          "here. Sign in normally and file the vehicle from the app."
      )
    }

    this.logger.log({
      message: "resuming a courier registration for an account that already exists",
      requestId: context.requestId,
      fields: { user_id: account.id }
    })

    return await this.authUsecase.startSession(account, context)
  }

  private async fileVehicle(
    session: AuthTokenOutputDto,
    dto: RegisterCourierInputDto
  ): Promise<number> {
    try {
      const registration = await this.fleet.registerDriver({
        principalId: session.user.principalId,
        vehiclePlate: dto.vehiclePlate,
        capacityKg: dto.capacityKg
      })

      if (registration.alreadyRegistered) {
        this.logger.log({
          message: "the vehicle was already filed for this principal",
          fields: { driver_id: registration.driverId }
        })
      }

      return registration.driverId
    } catch (error) {
      throw this.explain(error)
    }
  }

  private explain(error: unknown): Error {
    if (!(error instanceof FleetRegistryError)) {
      return error instanceof Error ? error : new Error(String(error))
    }

    if (error.isFault) {
      this.logger.error({
        message: "the fleet could not be asked to file a courier's vehicle",
        fields: { reason: error.message }
      })

      return new BadGatewayException({
        error: "FLEET_FAULT",
        message:
          "Your account exists, but identity could not file your vehicle because of a fault on its own " +
          "side. Nothing was filed. Submit the same details again later with the same email and " +
          "password; the account will be reused.",
        accountExists: true
      })
    }

    if (error.definitelyDidNothing) {
      return new BadRequestException({
        error: error.failure.code,
        message:
          `Your account exists, but the fleet refused the vehicle: ${error.failure.message}. ` +
          "Correct the vehicle details and submit again with the same email and password; " +
          "the account will be reused.",
        accountExists: true
      })
    }

    return new ServiceUnavailableException({
      error: error.failure.code,
      message:
        "Your account exists, but the fleet could not be reached to file your vehicle. " +
        "Submit the same details again to finish — nothing will be duplicated.",
      accountExists: true
    })
  }
}

export default CourierRegistrationUsecaseService
