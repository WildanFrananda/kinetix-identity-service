import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common"
import ApproveCourierOutputDto from "../dto/approve_courier_output.dto"
import UserEntity from "../../domain/entities/user.entity"
import UserRepositoryPort from "../../domain/ports/user_repository.port"
import PrincipalResolverService from "./principal_resolver.service"

@Injectable()
class CourierOnboardingUsecaseService {
  constructor(
    @Inject("UserRepositoryPort")
    private readonly userRepository: UserRepositoryPort,
    private readonly principalResolver: PrincipalResolverService
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

    // Idempotent: approving twice is the same fact stated twice, not a conflict.
    if (user.role === "courier") {
      return new ApproveCourierOutputDto(principalId, user.email, user.role)
    }

    // A role is single-valued here, so promotion overwrites. Silently turning an admin or a
    // verified seller into a courier would revoke everything that role carried — a demotion
    // disguised as an approval. Refuse and make the operator say what they actually mean.
    if (user.role !== "customer") {
      throw new ConflictException(
        `Account ${principalId} is a ${user.role}; promoting it to courier would revoke that role`
      )
    }

    user.role = "courier"
    await this.userRepository.save(user)

    await this.principalResolver.syncKind(principalId, user.role)

    return new ApproveCourierOutputDto(principalId, user.email, user.role)
  }
}

export default CourierOnboardingUsecaseService
