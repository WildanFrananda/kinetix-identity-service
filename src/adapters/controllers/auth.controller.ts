import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common"
import AuthUsecaseService from "../../application/services/auth_usecase.service"
import LoginInputDto from "../../application/dto/login_input.dto"
import RegisterUserInputDto from "../../application/dto/register_user_input.dto"
import AuthTokenOutputDto from "../../application/dto/auth_token_output.dto"

@Controller("api/auth")
class AuthController {
  constructor(private readonly authUsecase: AuthUsecaseService) {}

  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginInputDto): Promise<AuthTokenOutputDto> {
    return await this.authUsecase.login(dto)
  }

  @Post("register")
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterUserInputDto): Promise<AuthTokenOutputDto> {
    return await this.authUsecase.register(dto)
  }
}

export default AuthController
