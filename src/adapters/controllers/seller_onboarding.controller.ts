import { Body, Controller, HttpCode, HttpStatus, Param, ParseIntPipe, Post, UseGuards } from "@nestjs/common"
import SellerOnboardingUsecaseService from "../../application/services/seller_onboarding_usecase.service"
import OnboardSellerInputDto from "../../application/dto/onboard_seller_input.dto"
import MerchantVerificationEntity from "../../domain/entities/merchant_verification.entity"
import MerchantEntity from "../../domain/entities/merchant.entity"
import RolesGuard from "../guards/roles.guard"
import SelfOrStaffGuard, { SelfParam } from "../guards/self_or_staff.guard"
import { Roles } from "../decorators/auth.decorators"

@Controller("api/v1/sellers")
class SellerOnboardingController {
  constructor(private readonly sellerOnboardingUsecase: SellerOnboardingUsecaseService) {}

  @Post(":id/onboard")
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(SelfOrStaffGuard)
  @SelfParam("id")
  async onboardSeller(
    @Param("id", ParseIntPipe) userId: number,
    @Body() dto: OnboardSellerInputDto
  ): Promise<MerchantVerificationEntity> {
    return await this.sellerOnboardingUsecase.onboardSeller(userId, dto)
  }

  @Post(":id/verify")
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles("admin")
  async approveVerification(@Param("id", ParseIntPipe) userId: number): Promise<MerchantEntity> {
    return await this.sellerOnboardingUsecase.approveVerification(userId)
  }
}

export default SellerOnboardingController
