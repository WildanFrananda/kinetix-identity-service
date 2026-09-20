import { Inject, Injectable, Logger, NotFoundException } from "@nestjs/common"
import ProfileEntity from "../../domain/entities/profile.entity"
import ProfileRepositoryPort from "../../domain/ports/profile_repository.port"
import UpdateProfileInputDto from "../dto/update_profile_input.dto"
import GeocodingUsecaseService from "./geocoding_usecase.service"

@Injectable()
class UserProfileUsecaseService {
  private readonly logger = new Logger(UserProfileUsecaseService.name)

  constructor(
    @Inject("ProfileRepositoryPort")
    private readonly profileRepository: ProfileRepositoryPort,
    private readonly geocoding: GeocodingUsecaseService
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
    const addressBefore = profile ? this.addressOf(profile) : ""

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

    const addressAfter = this.addressOf(profile)
    const addressChanged = addressAfter !== addressBefore
    const neverPlaced = profile.latitude === undefined || profile.longitude === undefined

    if (addressAfter.length > 0 && (addressChanged || neverPlaced)) {
      await this.placeOnMap(profile, addressChanged)
    }

    return await this.profileRepository.save(profile)
  }

  private async placeOnMap(profile: ProfileEntity, addressChanged: boolean): Promise<void> {
    if (addressChanged) {
      profile.latitude = undefined
      profile.longitude = undefined
    }

    profile.geocodedAt = new Date()

    try {
      const outcome = await this.geocoding.geocode({
        streetAddress: profile.streetAddress,
        city: profile.city,
        postalCode: profile.postalCode
      })

      if (outcome.geocoded) {
        profile.latitude = outcome.location.latitude
        profile.longitude = outcome.location.longitude
        return
      }

      this.logger.warn(
        `profile ${profile.userId}: the address was saved but not placed (${outcome.failure}). ` +
          "Dispatch will have no point for it until it is geocoded."
      )
    } catch (error) {
      this.logger.error(
        `profile ${profile.userId}: the address was saved but the geocoder could not be asked: ` +
          `${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  private addressOf(profile: ProfileEntity): string {
    return [profile.streetAddress, profile.city, profile.postalCode]
      .filter((part) => typeof part === "string" && part.trim().length > 0)
      .join(", ")
      .trim()
  }
}

export default UserProfileUsecaseService
