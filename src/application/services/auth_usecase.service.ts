import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException
} from "@nestjs/common"
import * as bcrypt from "bcrypt"
import UserEntity from "../../domain/entities/user.entity"
import UserRepositoryPort from "../../domain/ports/user_repository.port"
import LoginInputDto from "../dto/login_input.dto"
import RegisterUserInputDto from "../dto/register_user_input.dto"
import AuthTokenOutputDto from "../dto/auth_token_output.dto"
import TokenService from "./token.service"
import PrincipalResolverService from "./principal_resolver.service"
import { generateSecret, otpauthUrl, verifyCode } from "../../infrastructure/crypto/totp"
import type { AccessClaims } from "../../types/token.type"
import type { TwoFactorChallenge, TwoFactorSetup } from "../../types/two_factor.type"

@Injectable()
class AuthUsecaseService {
  constructor(
    @Inject("UserRepositoryPort")
    private readonly userRepository: UserRepositoryPort,
    private readonly tokenService: TokenService,
    private readonly principalResolver: PrincipalResolverService
  ) {}

  async login(dto: LoginInputDto): Promise<AuthTokenOutputDto | TwoFactorChallenge> {
    const user: UserEntity | null = await this.userRepository.findByEmail(dto.email)
    if (!user) {
      await bcrypt.compare(dto.password, "$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv")
      throw new UnauthorizedException("Invalid email or password credentials")
    }

    const isPasswordValid: boolean = await bcrypt.compare(dto.password, user.passwordHash)
    if (!isPasswordValid) {
      throw new UnauthorizedException("Invalid email or password credentials")
    }

    if (user.isTwoFactorEnabled) {
      const principalId: string = await this.principalResolver.resolveOrMintForUser(user)
      const challenge = this.tokenService.issueMfaChallenge(
        { id: user.id, email: user.email, role: user.role },
        principalId
      )
      return { mfaRequired: true, challengeToken: challenge.token, expiresIn: challenge.expiresIn }
    }

    return await this.issueFor(user)
  }

  async verifyTwoFactor(challengeToken: string, code: string): Promise<AuthTokenOutputDto> {
    const claims = this.tokenService.peekMfaChallenge(challengeToken)
    const user: UserEntity | null = await this.userRepository.findById(claims.uid)
    if (!user) {
      throw new UnauthorizedException("The account behind this challenge no longer exists")
    }

    if (!user.isTwoFactorEnabled || !user.twoFactorSecret) {
      throw new UnauthorizedException("This account does not have two-factor authentication enabled")
    }

    if (!verifyCode(user.twoFactorSecret, code)) {
      throw new UnauthorizedException("That code is not valid")
    }

    return await this.issueFor(user)
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

    return await this.issueFor(savedUser)
  }

  async refresh(refreshToken: string): Promise<AuthTokenOutputDto> {
    const claims = this.tokenService.peekRefresh(refreshToken)
    const user: UserEntity | null = await this.userRepository.findById(claims.uid)
    if (!user) {
      throw new UnauthorizedException("The account behind this token no longer exists")
    }

    const pair = await this.tokenService.rotate(refreshToken, {
      id: user.id,
      email: user.email,
      role: user.role
    })

    const principalId: string = await this.principalResolver.resolveOrMintForUser(user)
    return new AuthTokenOutputDto(pair.accessToken, pair.refreshToken, pair.expiresIn, {
      id: user.id,
      email: user.email,
      role: user.role,
      principalId
    })
  }

  async logout(claims: AccessClaims, refreshToken?: string): Promise<void> {
    let familyId: string | undefined
    if (refreshToken) {
      familyId = this.tokenService.peekRefresh(refreshToken).fam
    }
    await this.tokenService.logout(claims, familyId)
  }

  async setupTwoFactor(userId: number): Promise<TwoFactorSetup> {
    const user: UserEntity | null = await this.userRepository.findById(userId)
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`)
    }
    if (user.isTwoFactorEnabled) {
      throw new ConflictException("Two-factor authentication is already enabled for this account")
    }

    const secret: string = generateSecret()
    user.twoFactorSecret = secret
    user.isTwoFactorEnabled = false
    await this.userRepository.save(user)

    return { twoFactorSecret: secret, qrCodeUrl: otpauthUrl(user.email, secret), enabled: false }
  }

  async enableTwoFactor(userId: number, code: string): Promise<{ enabled: true }> {
    const user: UserEntity | null = await this.userRepository.findById(userId)
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`)
    }
    if (!user.twoFactorSecret) {
      throw new BadRequestException("Request a two-factor secret before enabling it")
    }
    if (!verifyCode(user.twoFactorSecret, code)) {
      throw new UnauthorizedException("That code is not valid")
    }

    user.isTwoFactorEnabled = true
    await this.userRepository.save(user)
    return { enabled: true }
  }

  async disableTwoFactor(userId: number, code: string): Promise<{ enabled: false }> {
    const user: UserEntity | null = await this.userRepository.findById(userId)
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`)
    }
    if (!user.isTwoFactorEnabled || !user.twoFactorSecret) {
      throw new ConflictException("Two-factor authentication is not enabled for this account")
    }
    if (!verifyCode(user.twoFactorSecret, code)) {
      throw new UnauthorizedException("That code is not valid")
    }

    user.isTwoFactorEnabled = false
    user.twoFactorSecret = undefined
    await this.userRepository.save(user)
    return { enabled: false }
  }

  private async issueFor(user: UserEntity): Promise<AuthTokenOutputDto> {
    const principalId: string = await this.principalResolver.resolveOrMintForUser(user)
    await this.principalResolver.syncKind(principalId, user.role)

    const pair = await this.tokenService.issuePair(
      { id: user.id, email: user.email, role: user.role },
      principalId
    )

    return new AuthTokenOutputDto(pair.accessToken, pair.refreshToken, pair.expiresIn, {
      id: user.id,
      email: user.email,
      role: user.role,
      principalId
    })
  }
}

export default AuthUsecaseService
