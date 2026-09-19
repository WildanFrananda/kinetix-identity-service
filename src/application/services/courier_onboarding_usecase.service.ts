import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException
} from "@nestjs/common"
import ApproveCourierOutputDto from "../dto/approve_courier_output.dto"
import UserEntity from "../../domain/entities/user.entity"
import FleetRegistryError from "../../domain/errors/fleet_registry.error"
import FleetRegistryPort from "../../domain/ports/fleet_registry.port"
import UserRepositoryPort from "../../domain/ports/user_repository.port"
import PrincipalResolverService from "./principal_resolver.service"

@Injectable()
class CourierOnboardingUsecaseService {
  private readonly logger = new Logger(CourierOnboardingUsecaseService.name)

  constructor(
    @Inject("UserRepositoryPort")
    private readonly userRepository: UserRepositoryPort,
    private readonly principalResolver: PrincipalResolverService,
    @Inject("FleetRegistryPort")
    private readonly fleet: FleetRegistryPort
  ) {}

  async approveCourier(principalId: string): Promise<ApproveCourierOutputDto> {
    const userId: number | null = await this.principalResolver.userIdForPrincipal(principalId)
    if (userId === null) {
      throw new NotFoundException(`No account is registered under principal ${principalId}`)
    }

    const user: UserEntity | null = await this.userRepository.findById(userId)
    if (!user) {
      throw new NotFoundException(`No account is registered under principal ${principalId}`)
    }

    if (user.role === "courier") {
      const repeated = await this.activateInFleet(principalId)
      return new ApproveCourierOutputDto(
        principalId,
        user.email,
        user.role,
        repeated.driverId,
        repeated.activated
      )
    }

    if (user.role !== "customer") {
      throw new ConflictException(
        `Account ${principalId} is a ${user.role}; promoting it to courier would revoke that role`
      )
    }

    user.role = "courier"
    await this.userRepository.save(user)

    await this.principalResolver.syncKind(principalId, user.role)

    const fleet = await this.activateInFleet(principalId)

    return new ApproveCourierOutputDto(
      principalId,
      user.email,
      user.role,
      fleet.driverId,
      fleet.activated
    )
  }

  private async activateInFleet(
    principalId: string
  ): Promise<{ driverId: number | null; activated: boolean }> {
    try {
      const activation = await this.fleet.activateDriver(principalId)
      return { driverId: activation.driverId, activated: true }
    } catch (error) {
      if (error instanceof FleetRegistryError && error.failure.code === "NO_DRIVER_RECORD") {
        this.logger.warn({
          message: "approved an account with no vehicle filed; it must register one to drive",
          principal_id: principalId
        })
        return { driverId: null, activated: false }
      }

      if (error instanceof FleetRegistryError) {
        throw new ServiceUnavailableException({
          error: error.failure.code,
          message:
            "The account was promoted to courier, but the fleet could not be told to activate the " +
            "driver. Approve again once the fleet is reachable; nothing will be duplicated."
        })
      }

      throw error
    }
  }
}

export default CourierOnboardingUsecaseService
