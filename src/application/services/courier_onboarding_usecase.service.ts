import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common"
import ApproveCourierOutputDto from "../dto/approve_courier_output.dto"
import UserEntity from "../../domain/entities/user.entity"
import CourierApplicationRepositoryPort from "../../domain/ports/courier_application_repository.port"
import UserRepositoryPort from "../../domain/ports/user_repository.port"
import PrincipalResolverService from "./principal_resolver.service"
import type {
  ApplicationPage,
  ApplicationQuery,
  ApplicationTally,
  CourierApplicationStatus,
  CourierApplicationView
} from "../../types/application.type"

const NO_VEHICLE = "NO_DRIVER_RECORD"

@Injectable()
class CourierOnboardingUsecaseService {
  constructor(
    @Inject("UserRepositoryPort")
    private readonly userRepository: UserRepositoryPort,
    private readonly principalResolver: PrincipalResolverService,
    @Inject("CourierApplicationRepositoryPort")
    private readonly applications: CourierApplicationRepositoryPort
  ) {}

  async listApplications(
    query: ApplicationQuery<CourierApplicationStatus>
  ): Promise<ApplicationPage<CourierApplicationView>> {
    return await this.applications.list(query)
  }

  async tally(since: Date): Promise<ApplicationTally> {
    return await this.applications.tally(since)
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

    const application: CourierApplicationView | null = await this.applications.findByUser(userId)
    if (application?.status === "rejected") {
      throw new ConflictException(
        `The courier application of principal ${principalId} was rejected; it can be approved only after ` +
          "the courier registers the vehicle again"
      )
    }

    if (!application || !application.vehiclePlate) {
      throw new ConflictException({
        error: NO_VEHICLE,
        message:
          "This account has filed no vehicle, so it cannot be approved as a courier. Nothing was " +
          "changed; it must register a vehicle first."
      })
    }

    if (user.role !== "courier" && user.role !== "customer") {
      throw new ConflictException(
        `Account ${principalId} is a ${user.role}; promoting it to courier would revoke that role`
      )
    }

    const approvedApplication = await this.applications.recordApproved(user.id)
    if (!approvedApplication) {
      const latest = await this.applications.findByUser(userId)
      if (latest?.status === "rejected") {
        throw new ConflictException(
          `The courier application of principal ${principalId} was rejected; it can be approved only after ` +
            "the courier registers the vehicle again"
        )
      }

      throw new ConflictException({
        error: NO_VEHICLE,
        message:
          "This account has filed no vehicle, so it cannot be approved as a courier. Nothing was " +
          "changed; it must register a vehicle first."
      })
    }

    if (user.role !== "courier") {
      user.role = "courier"
      await this.userRepository.save(user)
      await this.principalResolver.syncKind(principalId, user.role)
    }

    return new ApproveCourierOutputDto(
      principalId,
      user.email,
      user.role,
      approvedApplication.vehiclePlate,
      approvedApplication.capacityKg
    )
  }

  async rejectCourier(principalId: string): Promise<CourierApplicationView> {
    const userId: number | null = await this.principalResolver.userIdForPrincipal(principalId)
    if (userId === null) {
      throw new NotFoundException(`No account is registered under principal ${principalId}`)
    }

    const user: UserEntity | null = await this.userRepository.findById(userId)
    if (!user) {
      throw new NotFoundException(`No account is registered under principal ${principalId}`)
    }

    await this.pendingApplicationOf(userId, principalId)

    if (user.role === "courier") {
      throw new ConflictException(
        `Account ${principalId} is already a courier: an approval began and did not finish. Approve it ` +
          "again to finish it; a rejection would leave the courier role in place"
      )
    }

    if (!(await this.applications.recordRejected(userId))) {
      await this.pendingApplicationOf(userId, principalId)
      throw new Error(`the courier application of principal ${principalId} stayed pending through a rejection`)
    }

    const rejected: CourierApplicationView | null = await this.applications.findByUser(userId)
    if (!rejected) {
      throw new NotFoundException(`No courier application is filed under principal ${principalId}`)
    }

    return rejected
  }

  private async pendingApplicationOf(userId: number, principalId: string): Promise<CourierApplicationView> {
    const application: CourierApplicationView | null = await this.applications.findByUser(userId)
    if (!application) {
      throw new NotFoundException(`No courier application is filed under principal ${principalId}`)
    }

    if (application.status !== "pending") {
      throw new ConflictException(
        `The courier application of principal ${principalId} is ${application.status}, not pending`
      )
    }

    return application
  }
}

export default CourierOnboardingUsecaseService
