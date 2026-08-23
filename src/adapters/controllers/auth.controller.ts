import { Body, Controller, HttpCode, HttpStatus, Param, ParseIntPipe, Post, UseGuards } from "@nestjs/common"
import { Throttle, ThrottlerGuard } from "@nestjs/throttler"
import AuthUsecaseService from "../../application/services/auth_usecase.service"
import LoginInputDto from "../../application/dto/login_input.dto"
import RegisterUserInputDto from "../../application/dto/register_user_input.dto"
import AuthTokenOutputDto from "../../application/dto/auth_token_output.dto"

@Controller("api/auth")
@UseGuards(ThrottlerGuard)
class AuthController {
  constructor(private readonly authUsecase: AuthUsecaseService) {}

  @Post("login")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async login(@Body() dto: LoginInputDto): Promise<AuthTokenOutputDto> {
    return await this.authUsecase.login(dto)
  }

  @Post("register")
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async register(@Body() dto: RegisterUserInputDto): Promise<AuthTokenOutputDto> {
    return await this.authUsecase.register(dto)
  }

  @Post("2fa/setup/:id")
  @HttpCode(HttpStatus.OK)
  async setupTwoFactor(
    @Param("id", ParseIntPipe) userId: number
  ): Promise<{ twoFactorSecret: string; qrCodeUrl: string }> {
    return await this.authUsecase.setupTwoFactor(userId)
  }

  @Post("oauth/callback")
  @HttpCode(HttpStatus.OK)
  async oauthCallback(
    @Body() dto: { email: string; provider: "google" | "github" }
  ): Promise<AuthTokenOutputDto> {
    return await this.authUsecase.handleOAuthCallback(dto.email, dto.provider)
  }
}

export default AuthController
