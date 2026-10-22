import {
  BadGatewayException,
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
import CourierApplicationRepositoryPort from "../../domain/ports/courier_application_repository.port"
import FleetRegistryPort from "../../domain/ports/fleet_registry.port"
import UserRepositoryPort from "../../domain/ports/user_repository.port"
import PrincipalResolverService from "./principal_resolver.service"
import type {
  ApplicationPage,
  ApplicationQuery,
  CourierApplicationStatus,
  CourierApplicationView
} from "../../types/application.type"
import type { FleetActivation } from "../../types/fleet.type"

const NO_VEHICLE = "NO_DRIVER_RECORD"

@Injectable()
class CourierOnboardingUsecaseService {
  private readonly logger = new Logger(CourierOnboardingUsecaseService.name)

  constructor(
    @Inject("UserRepositoryPort")
    private readonly userRepository: UserRepositoryPort,
    private readonly principalResolver: PrincipalResolverService,
    @Inject("FleetRegistryPort")
    private readonly fleet: FleetRegistryPort,
    @Inject("CourierApplicationRepositoryPort")
    private readonly applications: CourierApplicationRepositoryPort
  ) {}

  async listApplications(
    query: ApplicationQuery<CourierApplicationStatus>
  ): Promise<ApplicationPage<CourierApplicationView>> {
    return await this.applications.list(query)
  }

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
      const repeated: FleetActivation = await this.activateInFleet(user, principalId, false)
      return await this.approved(user, principalId, repeated)
    }

    if (user.role !== "customer") {
      throw new ConflictException(
        `Account ${principalId} is a ${user.role}; promoting it to courier would revoke that role`
      )
    }

    user.role = "courier"
    await this.userRepository.save(user)

    await this.principalResolver.syncKind(principalId, user.role)

    const activation: FleetActivation = await this.activateInFleet(user, principalId, true)

    return await this.approved(user, principalId, activation)
  }

  private async approved(
    user: UserEntity,
    principalId: string,
    activation: FleetActivation
  ): Promise<ApproveCourierOutputDto> {
    await this.applications.recordApproved({
      userId: user.id,
      principalId,
      driverId: activation.driverId
    })

    return new ApproveCourierOutputDto(principalId, user.email, user.role, activation.driverId, true)
  }

  private async activateInFleet(
    user: UserEntity,
    principalId: string,
    promoted: boolean
  ): Promise<FleetActivation> {
    try {
      return await this.fleet.activateDriver(principalId)
    } catch (error) {
      if (promoted && error instanceof FleetRegistryError && error.definitelyDidNothing) {
        await this.restoreCustomer(user, principalId)
      }
      throw this.refusalOf(error)
    }
  }

  private async restoreCustomer(user: UserEntity, principalId: string): Promise<void> {
    user.role = "customer"
    await this.userRepository.save(user)
    await this.principalResolver.syncKind(principalId, user.role)

    this.logger.warn({
      message: "the fleet refused the activation, so the account was returned to customer",
      principal_id: principalId
    })
  }

  private refusalOf(error: unknown): Error {
    if (!(error instanceof FleetRegistryError)) {
      return error instanceof Error ? error : new Error(String(error))
    }

    if (error.failure.code === NO_VEHICLE) {
      return new ConflictException({
        error: NO_VEHICLE,
        message:
          "This account has filed no vehicle, so it cannot be approved as a courier. Nothing was " +
          "changed; it must register a vehicle first."
      })
    }

    if (error.definitelyDidNothing) {
      return new BadGatewayException({
        error: error.failure.code,
        message:
          `The fleet refused to activate this driver (${error.failure.code}: ${error.failure.message}). ` +
          "Nothing was changed."
      })
    }

    return new ServiceUnavailableException({
      error: error.failure.code,
      message:
        "The account is now a courier, but the fleet could not be told to activate the driver. " +
        "Approve again once the fleet is reachable; nothing will be duplicated."
    })
  }
}

export default CourierOnboardingUsecaseService
