import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards
} from "@nestjs/common"
import { Throttle, ThrottlerGuard } from "@nestjs/throttler"
import CourierOnboardingUsecaseService from "../../application/services/courier_onboarding_usecase.service"
import CourierRegistrationUsecaseService from "../../application/services/courier_registration_usecase.service"
import ApproveCourierOutputDto from "../../application/dto/approve_courier_output.dto"
import ListCourierApplicationsQueryDto from "../../application/dto/list_courier_applications_query.dto"
import RegisterCourierInputDto from "../../application/dto/register_courier_input.dto"
import RegisterCourierOutputDto from "../../application/dto/register_courier_output.dto"
import type { ApplicationPage, CourierApplicationView } from "../../types/application.type"
import type { CallContext } from "../../types/call_context.type"
import { RequestContext } from "../decorators/request_context.decorator"
import ClientProofGuard from "../guards/client_proof.guard"
import RolesGuard from "../guards/roles.guard"
import { Public, Roles } from "../decorators/auth.decorators"
import { AdminAudit } from "../decorators/admin_audit.decorator"
import { applicationQueryOf } from "../mappers/application_query.mapper"

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
  @UseGuards(ClientProofGuard)
  async register(
    @Body() dto: RegisterCourierInputDto,
    @RequestContext() context: CallContext
  ): Promise<RegisterCourierOutputDto> {
    return await this.courierRegistrationUsecase.register(dto, context)
  }

  @Get("applications")
  @UseGuards(RolesGuard)
  @Roles("admin")
  @AdminAudit("identity.courier_applications_list")
  async listApplications(
    @Query() filter: ListCourierApplicationsQueryDto
  ): Promise<ApplicationPage<CourierApplicationView>> {
    return await this.courierOnboardingUsecase.listApplications(applicationQueryOf(filter))
  }

  @Post(":principalId/approve")
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles("admin")
  @AdminAudit("identity.courier_approve", "principalId")
  async approveCourier(
    @Param("principalId", new ParseUUIDPipe()) principalId: string
  ): Promise<ApproveCourierOutputDto> {
    return await this.courierOnboardingUsecase.approveCourier(principalId)
  }

  @Post(":principalId/reject")
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles("admin")
  @AdminAudit("identity.courier_reject", "principalId")
  async rejectCourier(
    @Param("principalId", new ParseUUIDPipe()) principalId: string
  ): Promise<CourierApplicationView> {
    return await this.courierOnboardingUsecase.rejectCourier(principalId)
  }
}

export default CourierOnboardingController
