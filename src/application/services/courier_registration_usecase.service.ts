import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException
} from "@nestjs/common"
import UserEntity from "../../domain/entities/user.entity"
import FleetRegistryError from "../../domain/errors/fleet_registry.error"
import FleetRegistryPort from "../../domain/ports/fleet_registry.port"
import UserRepositoryPort from "../../domain/ports/user_repository.port"
import AuthTokenOutputDto from "../dto/auth_token_output.dto"
import RegisterCourierInputDto from "../dto/register_courier_input.dto"
import RegisterCourierOutputDto from "../dto/register_courier_output.dto"
import AuthUsecaseService from "./auth_usecase.service"
import UserProfileUsecaseService from "./user_profile_usecase.service"

@Injectable()
class CourierRegistrationUsecaseService {
  private readonly logger = new Logger(CourierRegistrationUsecaseService.name)

  constructor(
    private readonly authUsecase: AuthUsecaseService,
    private readonly profileUsecase: UserProfileUsecaseService,
    @Inject("FleetRegistryPort")
    private readonly fleet: FleetRegistryPort,
    @Inject("UserRepositoryPort")
    private readonly userRepository: UserRepositoryPort
  ) {}

  async register(dto: RegisterCourierInputDto): Promise<RegisterCourierOutputDto> {
    const session: AuthTokenOutputDto = await this.sessionFor(dto)

    await this.profileUsecase.updateProfile(session.user.id, {
      fullName: dto.fullName,
      phoneNumber: dto.phoneNumber
    })

    const driverId: number = await this.fileVehicle(session, dto)

    return new RegisterCourierOutputDto(
      session.accessToken,
      session.refreshToken,
      session.expiresIn,
      session.user,
      driverId
    )
  }

  private async sessionFor(dto: RegisterCourierInputDto): Promise<AuthTokenOutputDto> {
    const existing: UserEntity | null = await this.userRepository.findByEmail(dto.email)

    if (!existing) {
      return await this.authUsecase.register({ email: dto.email, password: dto.password })
    }

    return await this.resume(dto)
  }

  private async resume(dto: RegisterCourierInputDto): Promise<AuthTokenOutputDto> {
    let session: AuthTokenOutputDto | { mfaRequired: true }

    try {
      session = await this.authUsecase.login({ email: dto.email, password: dto.password })
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw new ConflictException("An account with that email address already exists")
      }
      throw error
    }

    if ("mfaRequired" in session) {
      throw new ConflictException(
        "That account has two-factor authentication enabled, so registration cannot be resumed " +
          "here. Sign in normally and file the vehicle from the app."
      )
    }

    this.logger.log({
      message: "resuming a courier registration for an account that already exists",
      user_id: session.user.id
    })

    return session
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
          driver_id: registration.driverId
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

    if (error.definitelyDidNothing) {
      return new BadRequestException({
        error: error.failure.code,
        message: error.failure.message
      })
    }

    return new ServiceUnavailableException({
      error: error.failure.code,
      message:
        "Your account was created, but the fleet could not be reached to file your vehicle. " +
        "Submit the same details again to finish — nothing will be duplicated."
    })
  }
}

export default CourierRegistrationUsecaseService
