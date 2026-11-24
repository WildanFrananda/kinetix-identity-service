import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException
} from "@nestjs/common"
import UserEntity from "../../domain/entities/user.entity"
import { normalisedEmail } from "../../domain/email_address"
import RecordConflictError from "../../domain/errors/record_conflict.error"
import CourierApplicationRepositoryPort from "../../domain/ports/courier_application_repository.port"
import UserRepositoryPort from "../../domain/ports/user_repository.port"
import AuthTokenOutputDto from "../dto/auth_token_output.dto"
import RegisterCourierInputDto from "../dto/register_courier_input.dto"
import RegisterCourierOutputDto from "../dto/register_courier_output.dto"
import AuthUsecaseService from "./auth_usecase.service"
import UserProfileUsecaseService from "./user_profile_usecase.service"
import type { CallContext } from "../../types/call_context.type"
import type { UserRole } from "../../types/principal.type"

const ROLES_THAT_MAY_DRIVE: ReadonlyArray<UserRole> = ["customer", "courier"]

const ROLE_WITH_ARTICLE: Readonly<Record<UserRole, string>> = {
  customer: "a customer",
  seller: "a seller",
  courier: "a courier",
  admin: "an admin"
}

@Injectable()
class CourierRegistrationUsecaseService {
  private readonly logger = new Logger(CourierRegistrationUsecaseService.name)

  constructor(
    private readonly authUsecase: AuthUsecaseService,
    private readonly profileUsecase: UserProfileUsecaseService,
    @Inject("UserRepositoryPort")
    private readonly userRepository: UserRepositoryPort,
    @Inject("CourierApplicationRepositoryPort")
    private readonly applications: CourierApplicationRepositoryPort
  ) {}

  async register(dto: RegisterCourierInputDto, context: CallContext): Promise<RegisterCourierOutputDto> {
    const vehiclePlate = this.normalisePlate(dto.vehiclePlate)
    const capacityKg = this.requireCapacity(dto.capacityKg)
    const session: AuthTokenOutputDto = await this.sessionFor(dto, context)

    await this.profileUsecase.updateProfile(session.user.id, {
      fullName: dto.fullName,
      phoneNumber: dto.phoneNumber
    })

    try {
      await this.applications.recordFiled({
        userId: session.user.id,
        principalId: session.user.principalId,
        vehiclePlate,
        capacityKg
      })
    } catch (error) {
      if (error instanceof RecordConflictError) {
        throw new ConflictException({
          error: "VEHICLE_PLATE_TAKEN",
          message:
            `Your account exists, but vehicle plate ${vehiclePlate} is already registered to another courier. ` +
            "Correct the vehicle plate and submit again with the same email and password; the account will be reused.",
          accountExists: true
        })
      }
      throw error
    }

    return new RegisterCourierOutputDto(
      session.accessToken,
      session.refreshToken,
      session.expiresIn,
      session.user,
      vehiclePlate,
      capacityKg
    )
  }

  private normalisePlate(raw: string): string {
    const plate = (raw ?? "").trim().toUpperCase()
    if (plate.length === 0) {
      throw new BadRequestException({
        error: "BLANK_VEHICLE_PLATE",
        message: "vehiclePlate is required: a courier registration files a vehicle"
      })
    }
    return plate
  }

  private requireCapacity(capacityKg: number): number {
    if (!Number.isInteger(capacityKg) || capacityKg <= 0 || capacityKg > 5000) {
      throw new BadRequestException({
        error: "NO_CAPACITY",
        message: "capacityKg must be a whole number between 1 and 5000"
      })
    }
    return capacityKg
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
        `That account is ${ROLE_WITH_ARTICLE[account.role]}, and filing a vehicle under it would make it a courier. ` +
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
}

export default CourierRegistrationUsecaseService
