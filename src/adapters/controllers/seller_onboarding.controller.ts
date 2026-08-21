import { Body, Controller, HttpCode, HttpStatus, Param, ParseIntPipe, Post } from "@nestjs/common"
import SellerOnboardingUsecaseService from "../../application/services/seller_onboarding_usecase.service"
import OnboardSellerInputDto from "../../application/dto/onboard_seller_input.dto"
import MerchantVerificationEntity from "../../domain/entities/merchant_verification.entity"

@Controller("api/sellers")
class SellerOnboardingController {
  constructor(private readonly sellerOnboardingUsecase: SellerOnboardingUsecaseService) {}

  @Post(":id/onboard")
  @HttpCode(HttpStatus.CREATED)
  async onboardSeller(
    @Param("id", ParseIntPipe) userId: number,
    @Body() dto: OnboardSellerInputDto
  ): Promise<MerchantVerificationEntity> {
    return await this.sellerOnboardingUsecase.onboardSeller(userId, dto)
  }
}

export default SellerOnboardingController
