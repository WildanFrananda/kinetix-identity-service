import { Body, Controller, Get, Param, ParseIntPipe, Put } from "@nestjs/common"
import UserProfileUsecaseService from "../../application/services/user_profile_usecase.service"
import UpdateProfileInputDto from "../../application/dto/update_profile_input.dto"
import ProfileEntity from "../../domain/entities/profile.entity"

@Controller("api/users")
class UserProfileController {
  constructor(private readonly profileUsecase: UserProfileUsecaseService) {}

  @Get(":id/profile")
  async getProfile(@Param("id", ParseIntPipe) userId: number): Promise<ProfileEntity> {
    return await this.profileUsecase.getProfile(userId)
  }

  @Put(":id/profile")
  async updateProfile(
    @Param("id", ParseIntPipe) userId: number,
    @Body() dto: UpdateProfileInputDto
  ): Promise<ProfileEntity> {
    return await this.profileUsecase.updateProfile(userId, dto)
  }
}

export default UserProfileController
