import { Inject, Injectable, NotFoundException } from "@nestjs/common"
import ProfileEntity from "../../domain/entities/profile.entity"
import ProfileRepositoryPort from "../../domain/ports/profile_repository.port"
import UpdateProfileInputDto from "../dto/update_profile_input.dto"

@Injectable()
class UserProfileUsecaseService {
  constructor(
    @Inject("ProfileRepositoryPort")
    private readonly profileRepository: ProfileRepositoryPort
  ) {}

  async getProfile(userId: number): Promise<ProfileEntity> {
    const profile: ProfileEntity | null = await this.profileRepository.findByUserId(userId)
    if (!profile) {
      throw new NotFoundException(`Profile not found for User ID ${userId}`)
    }
    return profile
  }

  async updateProfile(userId: number, dto: UpdateProfileInputDto): Promise<ProfileEntity> {
    let profile: ProfileEntity | null = await this.profileRepository.findByUserId(userId)

    if (!profile) {
      profile = new ProfileEntity(
        0,
        userId,
        dto.fullName || "",
        dto.phoneNumber || "",
        dto.streetAddress || "",
        dto.city || "",
        dto.postalCode || "",
        dto.avatarUrl
      )
    } else {
      if (dto.fullName !== undefined) profile.fullName = dto.fullName
      if (dto.phoneNumber !== undefined) profile.phoneNumber = dto.phoneNumber
      if (dto.streetAddress !== undefined) profile.streetAddress = dto.streetAddress
      if (dto.city !== undefined) profile.city = dto.city
      if (dto.postalCode !== undefined) profile.postalCode = dto.postalCode
      if (dto.avatarUrl !== undefined) profile.avatarUrl = dto.avatarUrl
    }

    return await this.profileRepository.save(profile)
  }
}

export default UserProfileUsecaseService
