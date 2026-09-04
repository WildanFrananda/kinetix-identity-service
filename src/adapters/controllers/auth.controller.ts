import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, UseGuards } from "@nestjs/common"
import { Throttle, ThrottlerGuard } from "@nestjs/throttler"
import AuthUsecaseService from "../../application/services/auth_usecase.service"
import LoginInputDto from "../../application/dto/login_input.dto"
import RegisterUserInputDto from "../../application/dto/register_user_input.dto"
import RefreshInputDto from "../../application/dto/refresh_input.dto"
import TwoFactorCodeInputDto from "../../application/dto/two_factor_code_input.dto"
import TwoFactorVerifyInputDto from "../../application/dto/two_factor_verify_input.dto"
import AuthTokenOutputDto from "../../application/dto/auth_token_output.dto"
import type { AccessClaims } from "../../types/token.type"
import type { CurrentUserView, LogoutBody } from "../../types/auth.type"
import type { TwoFactorChallenge, TwoFactorSetup } from "../../types/two_factor.type"
import { CurrentUser, Public } from "../decorators/auth.decorators"
import SelfOrStaffGuard, { SelfParam } from "../guards/self_or_staff.guard"

@Controller("api/v1/auth")
@UseGuards(ThrottlerGuard)
class AuthController {
  constructor(private readonly authUsecase: AuthUsecaseService) {}

  @Public()
  @Post("login")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async login(@Body() dto: LoginInputDto): Promise<AuthTokenOutputDto | TwoFactorChallenge> {
    return await this.authUsecase.login(dto)
  }

  @Public()
  @Post("2fa/verify")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async verifyTwoFactor(@Body() dto: TwoFactorVerifyInputDto): Promise<AuthTokenOutputDto> {
    return await this.authUsecase.verifyTwoFactor(dto.challengeToken, dto.code)
  }

  @Public()
  @Post("register")
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async register(@Body() dto: RegisterUserInputDto): Promise<AuthTokenOutputDto> {
    return await this.authUsecase.register(dto)
  }

  @Public()
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async refresh(@Body() dto: RefreshInputDto): Promise<AuthTokenOutputDto> {
    return await this.authUsecase.refresh(dto.refreshToken)
  }

  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@CurrentUser() claims: AccessClaims, @Body() body: LogoutBody): Promise<void> {
    await this.authUsecase.logout(claims, body?.refreshToken)
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
  @UseGuards(SelfOrStaffGuard)
  @SelfParam("id")
  async setupTwoFactor(@Param("id", ParseIntPipe) userId: number): Promise<TwoFactorSetup> {
    return await this.authUsecase.setupTwoFactor(userId)
  }

  @Post("2fa/enable/:id")
  @HttpCode(HttpStatus.OK)
  @UseGuards(SelfOrStaffGuard)
  @SelfParam("id")
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async enableTwoFactor(
    @Param("id", ParseIntPipe) userId: number,
    @Body() dto: TwoFactorCodeInputDto
  ): Promise<{ enabled: true }> {
    return await this.authUsecase.enableTwoFactor(userId, dto.code)
  }

  @Post("2fa/disable/:id")
  @HttpCode(HttpStatus.OK)
  @UseGuards(SelfOrStaffGuard)
  @SelfParam("id")
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async disableTwoFactor(
    @Param("id", ParseIntPipe) userId: number,
    @Body() dto: TwoFactorCodeInputDto
  ): Promise<{ enabled: false }> {
    return await this.authUsecase.disableTwoFactor(userId, dto.code)
  }
}

export default AuthController
