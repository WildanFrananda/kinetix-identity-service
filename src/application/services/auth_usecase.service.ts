import { Inject, Injectable, UnauthorizedException, ConflictException, NotFoundException } from "@nestjs/common"
import * as bcrypt from "bcrypt"
import { randomBytes } from "crypto"
import UserEntity from "../../domain/entities/user.entity"
import UserRepositoryPort from "../../domain/ports/user_repository.port"
import LoginInputDto from "../dto/login_input.dto"
import RegisterUserInputDto from "../dto/register_user_input.dto"
import AuthTokenOutputDto from "../dto/auth_token_output.dto"
import TokenService from "./token.service"
import PrincipalResolverService from "./principal_resolver.service"
import type { AccessClaims } from "../../types/token.type"
import type { TwoFactorSetup } from "../../types/auth.type"

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"

function base32Encode(bytes: Buffer): string {
  let bits = 0
  let value = 0
  let output = ""
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31]
  }
  return output
}

@Injectable()
class AuthUsecaseService {
  constructor(
    @Inject("UserRepositoryPort")
    private readonly userRepository: UserRepositoryPort,
    private readonly tokenService: TokenService,
    private readonly principalResolver: PrincipalResolverService
  ) {}

  async login(dto: LoginInputDto): Promise<AuthTokenOutputDto> {
    const user: UserEntity | null = await this.userRepository.findByEmail(dto.email)
    if (!user) {
      await bcrypt.compare(dto.password, "$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv")
      throw new UnauthorizedException("Invalid email or password credentials")
    }

    const isPasswordValid: boolean = await bcrypt.compare(dto.password, user.passwordHash)
    if (!isPasswordValid) {
      throw new UnauthorizedException("Invalid email or password credentials")
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

    const secret: string = base32Encode(randomBytes(20))
    user.isTwoFactorEnabled = true
    user.twoFactorSecret = secret
    await this.userRepository.save(user)

    const label: string = encodeURIComponent(`Kinetix:${user.email}`)
    return {
      twoFactorSecret: secret,
      qrCodeUrl: `otpauth://totp/${label}?secret=${secret}&issuer=Kinetix&algorithm=SHA1&digits=6&period=30`
    }
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
