import { Inject, Injectable, UnauthorizedException, ConflictException, NotFoundException } from "@nestjs/common"
import { JwtService } from "@nestjs/jwt"
import * as bcrypt from "bcrypt"
import UserEntity from "../../domain/entities/user.entity"
import UserRepositoryPort from "../../domain/ports/user_repository.port"
import LoginInputDto from "../dto/login_input.dto"
import RegisterUserInputDto from "../dto/register_user_input.dto"
import AuthTokenOutputDto from "../dto/auth_token_output.dto"

@Injectable()
class AuthUsecaseService {
  constructor(
    @Inject("UserRepositoryPort")
    private readonly userRepository: UserRepositoryPort,
    private readonly jwtService: JwtService
  ) {}

  async login(dto: LoginInputDto): Promise<AuthTokenOutputDto> {
    const user: UserEntity | null = await this.userRepository.findByEmail(dto.email)
    if (!user) {
      throw new UnauthorizedException("Invalid email or password credentials")
    }

    const isPasswordValid: boolean = await bcrypt.compare(dto.password, user.passwordHash)
    if (!isPasswordValid) {
      throw new UnauthorizedException("Invalid email or password credentials")
    }

    const payload = { sub: user.id, email: user.email, role: user.role }
    const accessToken: string = this.jwtService.sign(payload)

    return new AuthTokenOutputDto(accessToken, 86400, {
      id: user.id,
      email: user.email,
      role: user.role
    })
  }

  async register(dto: RegisterUserInputDto): Promise<AuthTokenOutputDto> {
    const existingUser: UserEntity | null = await this.userRepository.findByEmail(dto.email)
    if (existingUser) {
      throw new ConflictException("Email address is already registered")
    }

    const saltRounds: number = 10
    const passwordHash: string = await bcrypt.hash(dto.password, saltRounds)

    const newUser = new UserEntity(0, dto.email, passwordHash, "customer")
    const savedUser: UserEntity = await this.userRepository.save(newUser)

    const payload = { sub: savedUser.id, email: savedUser.email, role: savedUser.role }
    const accessToken: string = this.jwtService.sign(payload)

    return new AuthTokenOutputDto(accessToken, 86400, {
      id: savedUser.id,
      email: savedUser.email,
      role: savedUser.role
    })
  }

  async setupTwoFactor(userId: number): Promise<{ twoFactorSecret: string; qrCodeUrl: string }> {
    const user: UserEntity | null = await this.userRepository.findById(userId)
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`)
    }

    const secret: string = `KINETIX_2FA_${userId}_${Math.random().toString(36).substring(2, 10).toUpperCase()}`
    user.isTwoFactorEnabled = true
    user.twoFactorSecret = secret
    await this.userRepository.save(user)

    return {
      twoFactorSecret: secret,
      qrCodeUrl: `otpauth://totp/Kinetix:${user.email}?secret=${secret}&issuer=Kinetix`
    }
  }

}

export default AuthUsecaseService
