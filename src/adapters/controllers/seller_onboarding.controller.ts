import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, UseGuards } from "@nestjs/common"
import SellerOnboardingUsecaseService from "../../application/services/seller_onboarding_usecase.service"
import ListSellerApplicationsQueryDto from "../../application/dto/list_seller_applications_query.dto"
import OnboardSellerInputDto from "../../application/dto/onboard_seller_input.dto"
import MerchantVerificationEntity from "../../domain/entities/merchant_verification.entity"
import type {
  ApplicationPage,
  ApprovedMerchant,
  SellerApplication,
  SellerApplicationView
} from "../../types/application.type"
import RolesGuard from "../guards/roles.guard"
import SelfOrStaffGuard, { SelfParam } from "../guards/self_or_staff.guard"
import { Roles } from "../decorators/auth.decorators"
import { applicationQueryOf } from "../mappers/application_query.mapper"
import { AccountIdParam } from "../decorators/account_id_param.decorator"
import { AdminAudit } from "../decorators/admin_audit.decorator"

@Controller("api/v1/sellers")
class SellerOnboardingController {
  constructor(private readonly sellerOnboardingUsecase: SellerOnboardingUsecaseService) {}

  @Get("applications")
  @UseGuards(RolesGuard)
  @Roles("admin")
  @AdminAudit("identity.seller_applications_list")
  async listApplications(
    @Query() filter: ListSellerApplicationsQueryDto
  ): Promise<ApplicationPage<SellerApplicationView>> {
    return await this.sellerOnboardingUsecase.listApplications(applicationQueryOf(filter))
  }

  @Get(":id/application")
  @UseGuards(SelfOrStaffGuard)
  @SelfParam("id")
  @AdminAudit("identity.seller_application_read", "id")
  async application(@AccountIdParam("id") userId: number): Promise<SellerApplication> {
    return await this.sellerOnboardingUsecase.applicationOf(userId)
  }

  @Post(":id/onboard")
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(SelfOrStaffGuard)
  @SelfParam("id")
  @AdminAudit("identity.seller_onboard", "id")
  async onboardSeller(
    @AccountIdParam("id") userId: number,
    @Body() dto: OnboardSellerInputDto
  ): Promise<MerchantVerificationEntity> {
    return await this.sellerOnboardingUsecase.onboardSeller(userId, dto)
  }

  @Post(":id/verify")
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles("admin")
  @AdminAudit("identity.seller_verify", "id")
  async approveVerification(@AccountIdParam("id") userId: number): Promise<ApprovedMerchant> {
    return await this.sellerOnboardingUsecase.approveVerification(userId)
  }

  @Post(":id/reject")
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles("admin")
  @AdminAudit("identity.seller_reject", "id")
  async rejectVerification(@AccountIdParam("id") userId: number): Promise<SellerApplication> {
    return await this.sellerOnboardingUsecase.rejectVerification(userId)
  }
}

export default SellerOnboardingController
