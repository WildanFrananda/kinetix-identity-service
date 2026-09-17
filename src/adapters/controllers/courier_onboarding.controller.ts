import { Controller, HttpCode, HttpStatus, Param, Post, UseGuards } from "@nestjs/common"
import CourierOnboardingUsecaseService from "../../application/services/courier_onboarding_usecase.service"
import ApproveCourierOutputDto from "../../application/dto/approve_courier_output.dto"
import RolesGuard from "../guards/roles.guard"
import { Roles } from "../decorators/auth.decorators"

@Controller("api/v1/couriers")
class CourierOnboardingController {
  constructor(private readonly courierOnboardingUsecase: CourierOnboardingUsecaseService) {}

  @Post(":principalId/approve")
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles("admin")
  async approveCourier(@Param("principalId") principalId: string): Promise<ApproveCourierOutputDto> {
    return await this.courierOnboardingUsecase.approveCourier(principalId)
  }
}

export default CourierOnboardingController
