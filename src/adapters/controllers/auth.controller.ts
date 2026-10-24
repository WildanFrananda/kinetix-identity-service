import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from "@nestjs/common"
import { Throttle, ThrottlerGuard } from "@nestjs/throttler"
import AuthUsecaseService from "../../application/services/auth_usecase.service"
import LoginInputDto from "../../application/dto/login_input.dto"
import RegisterUserInputDto from "../../application/dto/register_user_input.dto"
import RefreshInputDto from "../../application/dto/refresh_input.dto"
import TwoFactorDisableInputDto from "../../application/dto/two_factor_disable_input.dto"
import TwoFactorEnableInputDto from "../../application/dto/two_factor_enable_input.dto"
import TwoFactorSetupInputDto from "../../application/dto/two_factor_setup_input.dto"
import TwoFactorVerifyInputDto from "../../application/dto/two_factor_verify_input.dto"
import AuthTokenOutputDto from "../../application/dto/auth_token_output.dto"
import LogoutInputDto from "../../application/dto/logout_input.dto"
import type { AccessClaims, SessionClaims } from "../../types/token.type"
import type { CurrentUserView } from "../../types/auth.type"
import type { CallContext } from "../../types/call_context.type"
import type { TwoFactorChallenge, TwoFactorEnrolment, TwoFactorSetup } from "../../types/two_factor.type"
import { AcceptsEnrolment, CurrentSession, CurrentUser, Public } from "../decorators/auth.decorators"
import ClientProofGuard from "../guards/client_proof.guard"
import SelfOrStaffGuard, { OwnerParam } from "../guards/self_or_staff.guard"
import { AccountIdParam } from "../decorators/account_id_param.decorator"
import { RequestContext } from "../decorators/request_context.decorator"

@Controller("api/v1/auth")
@UseGuards(ThrottlerGuard)
class AuthController {
  constructor(private readonly authUsecase: AuthUsecaseService) {}

  @Public()
  @Post("login")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @UseGuards(ClientProofGuard)
  async login(
    @Body() dto: LoginInputDto,
    @RequestContext() context: CallContext
  ): Promise<AuthTokenOutputDto | TwoFactorChallenge | TwoFactorEnrolment> {
    return await this.authUsecase.login(dto, context)
  }

  @Public()
  @Post("2fa/verify")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @UseGuards(ClientProofGuard)
  async verifyTwoFactor(
    @Body() dto: TwoFactorVerifyInputDto,
    @RequestContext() context: CallContext
  ): Promise<AuthTokenOutputDto> {
    return await this.authUsecase.verifyTwoFactor(dto.challengeToken, dto.code, context)
  }

  @Public()
  @Post("register")
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @UseGuards(ClientProofGuard)
  async register(
    @Body() dto: RegisterUserInputDto,
    @RequestContext() context: CallContext
  ): Promise<AuthTokenOutputDto> {
    return await this.authUsecase.register(dto, context)
  }

  @Public()
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(ClientProofGuard)
  async refresh(
    @Body() dto: RefreshInputDto,
    @RequestContext() context: CallContext
  ): Promise<AuthTokenOutputDto> {
    return await this.authUsecase.refresh(dto.refreshToken, context)
  }

  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@CurrentUser() claims: AccessClaims, @Body() dto: LogoutInputDto): Promise<void> {
    await this.authUsecase.logout(claims, dto.refreshToken)
  }

  @Get("me")
  @HttpCode(HttpStatus.OK)
  me(@CurrentUser() claims: AccessClaims): CurrentUserView {
    return {
      principalId: claims.sub,
      userId: claims.uid,
      email: claims.email,
      role: claims.role,
      expiresAt: new Date(claims.exp * 1000).toISOString()
    }
  }

  @Post("2fa/setup/:id")
  @HttpCode(HttpStatus.OK)
  @AcceptsEnrolment()
  @UseGuards(SelfOrStaffGuard)
  @OwnerParam("id")
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async setupTwoFactor(
    @CurrentSession() claims: SessionClaims,
    @AccountIdParam("id") userId: number,
    @Body() dto: TwoFactorSetupInputDto,
    @RequestContext() context: CallContext
  ): Promise<TwoFactorSetup> {
    return await this.authUsecase.setupTwoFactor(claims, userId, dto, context)
  }

  @Post("2fa/enable/:id")
  @HttpCode(HttpStatus.OK)
  @AcceptsEnrolment()
  @UseGuards(SelfOrStaffGuard)
  @OwnerParam("id")
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async enableTwoFactor(
    @CurrentSession() claims: SessionClaims,
    @AccountIdParam("id") userId: number,
    @Body() dto: TwoFactorEnableInputDto,
    @RequestContext() context: CallContext
  ): Promise<{ enabled: true }> {
    return await this.authUsecase.enableTwoFactor(claims, userId, dto, context)
  }

  @Post("2fa/disable/:id")
  @HttpCode(HttpStatus.OK)
  @UseGuards(SelfOrStaffGuard)
  @OwnerParam("id")
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async disableTwoFactor(
    @CurrentUser() claims: AccessClaims,
    @AccountIdParam("id") userId: number,
    @Body() dto: TwoFactorDisableInputDto,
    @RequestContext() context: CallContext
  ): Promise<{ enabled: false }> {
    return await this.authUsecase.disableTwoFactor(claims, userId, dto, context)
  }
}

export default AuthController
