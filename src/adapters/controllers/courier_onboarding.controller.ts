import { Body, Controller, HttpCode, HttpStatus, Param, Post, UseGuards } from "@nestjs/common"
import { Throttle, ThrottlerGuard } from "@nestjs/throttler"
import CourierOnboardingUsecaseService from "../../application/services/courier_onboarding_usecase.service"
import CourierRegistrationUsecaseService from "../../application/services/courier_registration_usecase.service"
import ApproveCourierOutputDto from "../../application/dto/approve_courier_output.dto"
import RegisterCourierInputDto from "../../application/dto/register_courier_input.dto"
import RegisterCourierOutputDto from "../../application/dto/register_courier_output.dto"
import RolesGuard from "../guards/roles.guard"
import { Public, Roles } from "../decorators/auth.decorators"

@Controller("api/v1/couriers")
@UseGuards(ThrottlerGuard)
class CourierOnboardingController {
  constructor(
    private readonly courierOnboardingUsecase: CourierOnboardingUsecaseService,
    private readonly courierRegistrationUsecase: CourierRegistrationUsecaseService
  ) {}

  @Public()
  @Post("register")
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async register(@Body() dto: RegisterCourierInputDto): Promise<RegisterCourierOutputDto> {
    return await this.courierRegistrationUsecase.register(dto)
  }

  @Post(":principalId/approve")
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles("admin")
  async approveCourier(@Param("principalId") principalId: string): Promise<ApproveCourierOutputDto> {
    return await this.courierOnboardingUsecase.approveCourier(principalId)
  }
}

export default CourierOnboardingController
