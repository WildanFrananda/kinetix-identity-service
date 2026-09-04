import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, UseGuards } from "@nestjs/common"
import { Throttle, ThrottlerGuard } from "@nestjs/throttler"
import AuthUsecaseService from "../../application/services/auth_usecase.service"
import LoginInputDto from "../../application/dto/login_input.dto"
import RegisterUserInputDto from "../../application/dto/register_user_input.dto"
import RefreshInputDto from "../../application/dto/refresh_input.dto"
import AuthTokenOutputDto from "../../application/dto/auth_token_output.dto"
import type { AccessClaims } from "../../types/token.type"
import type { CurrentUserView, LogoutBody, TwoFactorSetup } from "../../types/auth.type"
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
  async login(@Body() dto: LoginInputDto): Promise<AuthTokenOutputDto> {
    return await this.authUsecase.login(dto)
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
  async setupTwoFactor(
    @Param("id", ParseIntPipe) userId: number
  ): Promise<TwoFactorSetup> {
    return await this.authUsecase.setupTwoFactor(userId)
  }
}

export default AuthController
