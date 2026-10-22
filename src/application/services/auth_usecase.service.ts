import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException
} from "@nestjs/common"
import * as bcrypt from "bcrypt"
import UserEntity from "../../domain/entities/user.entity"
import { normalisedEmail } from "../../domain/email_address"
import UserRepositoryPort from "../../domain/ports/user_repository.port"
import LoginInputDto from "../dto/login_input.dto"
import RegisterUserInputDto from "../dto/register_user_input.dto"
import AuthTokenOutputDto from "../dto/auth_token_output.dto"
import TokenService from "./token.service"
import PrincipalResolverService from "./principal_resolver.service"
import { acceptedStep, generateSecret, otpauthUrl } from "../../infrastructure/crypto/totp"
import type { Credentials } from "../../types/auth.type"
import type { AccessClaims } from "../../types/token.type"
import type { TwoFactorChallenge, TwoFactorSetup } from "../../types/two_factor.type"

const UNKNOWN_ACCOUNT_HASH = "$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv"

@Injectable()
class AuthUsecaseService {
  constructor(
    @Inject("UserRepositoryPort")
    private readonly userRepository: UserRepositoryPort,
    private readonly tokenService: TokenService,
    private readonly principalResolver: PrincipalResolverService
  ) {}

  async login(dto: LoginInputDto): Promise<AuthTokenOutputDto | TwoFactorChallenge> {
    const user: UserEntity = await this.verifyPassword(dto)

    if (user.isTwoFactorEnabled) {
      const principalId: string = await this.principalResolver.resolveOrMintForUser(user)
      const challenge = this.tokenService.issueMfaChallenge(
        { id: user.id, email: user.email, role: user.role },
        principalId
      )
      return { mfaRequired: true, challengeToken: challenge.token, expiresIn: challenge.expiresIn }
    }

    return await this.startSession(user)
  }

  async verifyPassword(credentials: Credentials): Promise<UserEntity> {
    const user: UserEntity | null = await this.userRepository.findByEmail(normalisedEmail(credentials.email))
    if (!user) {
      await bcrypt.compare(credentials.password, UNKNOWN_ACCOUNT_HASH)
      throw new UnauthorizedException("Invalid email or password credentials")
    }

    const isPasswordValid: boolean = await bcrypt.compare(credentials.password, user.passwordHash)
    if (!isPasswordValid) {
      throw new UnauthorizedException("Invalid email or password credentials")
    }

    return user
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

    const step: number | null = acceptedStep(user.twoFactorSecret, code)
    if (step === null) {
      throw new UnauthorizedException("That code is not valid")
    }

    await this.tokenService.consumeMfaChallenge(claims)

    const fresh: boolean = await this.userRepository.acceptTwoFactorStep(user.id, step)
    if (!fresh) {
      throw new UnauthorizedException("That code has already been used; sign in again with the next one")
    }

    return await this.startSession(user)
  }

  async register(dto: RegisterUserInputDto): Promise<AuthTokenOutputDto> {
    const email: string = normalisedEmail(dto.email)
    const existingUser: UserEntity | null = await this.userRepository.findByEmail(email)
    if (existingUser) {
      throw new ConflictException("Email address is already registered")
    }

    const saltRounds: number = 10
    const passwordHash: string = await bcrypt.hash(dto.password, saltRounds)

    const newUser = new UserEntity(0, email, passwordHash, "customer")
    const savedUser: UserEntity = await this.userRepository.save(newUser)

    return await this.startSession(savedUser)
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
    if (refreshToken !== undefined) {
      const refresh = this.tokenService.peekRefresh(refreshToken)
      if (refresh.sub !== claims.sub) {
        throw new ForbiddenException("That refresh token belongs to another account")
      }
      familyId = refresh.fam
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

  async enableTwoFactor(claims: AccessClaims, userId: number, code: string): Promise<{ enabled: true }> {
    const user: UserEntity = await this.ownAccount(claims, userId)
    if (!user.twoFactorSecret) {
      throw new BadRequestException("Request a two-factor secret before enabling it")
    }

    await this.acceptCode(user.id, user.twoFactorSecret, code)
    await this.tokenService.revokeOtherSessions(claims.sub, claims.fam, "two_factor_enabled")

    user.isTwoFactorEnabled = true
    await this.userRepository.save(user)

    return { enabled: true }
  }

  async disableTwoFactor(claims: AccessClaims, userId: number, code: string): Promise<{ enabled: false }> {
    const user: UserEntity = await this.ownAccount(claims, userId)
    if (!user.isTwoFactorEnabled || !user.twoFactorSecret) {
      throw new ConflictException("Two-factor authentication is not enabled for this account")
    }

    await this.acceptCode(user.id, user.twoFactorSecret, code)
    await this.tokenService.revokeOtherSessions(claims.sub, claims.fam, "two_factor_disabled")

    user.isTwoFactorEnabled = false
    user.twoFactorSecret = null
    await this.userRepository.save(user)

    return { enabled: false }
  }

  async startSession(user: UserEntity): Promise<AuthTokenOutputDto> {
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

  private async ownAccount(claims: AccessClaims, userId: number): Promise<UserEntity> {
    if (claims.uid !== userId) {
      throw new ForbiddenException("This account may only act on its own second factor")
    }

    const user: UserEntity | null = await this.userRepository.findById(userId)
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`)
    }

    return user
  }

  private async acceptCode(userId: number, secret: string, code: string): Promise<void> {
    const step: number | null = acceptedStep(secret, code)
    if (step === null) {
      throw new UnprocessableEntityException("That code is not valid")
    }

    const fresh: boolean = await this.userRepository.acceptTwoFactorStep(userId, step)
    if (!fresh) {
      throw new UnprocessableEntityException("That code has already been used; wait for the next one")
    }
  }
}

export default AuthUsecaseService
