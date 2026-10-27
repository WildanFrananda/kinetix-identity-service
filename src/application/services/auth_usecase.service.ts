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
import ClientMismatchError from "../../domain/errors/client_mismatch.error"
import UserRepositoryPort from "../../domain/ports/user_repository.port"
import { checkedClient, clientNameOf, sessionClientDecision } from "../../domain/session_client"
import LoginInputDto from "../dto/login_input.dto"
import RegisterUserInputDto from "../dto/register_user_input.dto"
import AuthTokenOutputDto from "../dto/auth_token_output.dto"
import TwoFactorDisableInputDto from "../dto/two_factor_disable_input.dto"
import TwoFactorEnableInputDto from "../dto/two_factor_enable_input.dto"
import TwoFactorSetupInputDto from "../dto/two_factor_setup_input.dto"
import TokenService from "./token.service"
import PrincipalResolverService from "./principal_resolver.service"
import SignInAttemptsService from "./sign_in_attempts.service"
import ClientGateService from "./client_gate.service"
import { requiresTwoFactor } from "../../domain/two_factor_required"
import { acceptedStep, generateSecret, otpauthUrl } from "../../infrastructure/crypto/totp"
import type { Credentials } from "../../types/auth.type"
import type { CallContext } from "../../types/call_context.type"
import type { AdmittedAttempt } from "../../types/sign_in_attempt.type"
import type { AccessClaims, RotatedPair, SessionClaims } from "../../types/token.type"
import type { TwoFactorChallenge, TwoFactorEnrolment, TwoFactorSetup } from "../../types/two_factor.type"

const UNKNOWN_ACCOUNT_HASH = "$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv"

@Injectable()
class AuthUsecaseService {
  constructor(
    @Inject("UserRepositoryPort")
    private readonly userRepository: UserRepositoryPort,
    private readonly tokenService: TokenService,
    private readonly principalResolver: PrincipalResolverService,
    private readonly signInAttempts: SignInAttemptsService,
    private readonly clientGate: ClientGateService
  ) {}

  async login(
    dto: LoginInputDto,
    context: CallContext
  ): Promise<AuthTokenOutputDto | TwoFactorChallenge | TwoFactorEnrolment> {
    const user: UserEntity = await this.verifyPassword(dto, context)

    if (user.isTwoFactorEnabled) {
      const principalId: string = await this.principalResolver.resolveOrMintForUser(user)
      const challenge = this.tokenService.issueMfaChallenge(
        { id: user.id, email: user.email, role: user.role },
        principalId
      )
      return { mfaRequired: true, challengeToken: challenge.token, expiresIn: challenge.expiresIn }
    }

    if (requiresTwoFactor(user.role)) {
      return await this.startEnrolment(user, context)
    }

    return await this.startSession(user, context)
  }

  async verifyPassword(credentials: Credentials, context: CallContext): Promise<UserEntity> {
    const email: string = normalisedEmail(credentials.email)
    const attempt = await this.signInAttempts.admit(email)

    const user: UserEntity | null = await this.userRepository.findByEmail(email)
    if (!user) {
      await bcrypt.compare(credentials.password, UNKNOWN_ACCOUNT_HASH)
      this.signInAttempts.failed({ stage: "password", reason: "unknown_account", email, user: null, attempt }, context)
      throw new UnauthorizedException("Invalid email or password credentials")
    }

    await this.checkPassword(user, credentials.password, attempt, context)

    return user
  }

  async verifyTwoFactor(challengeToken: string, code: string, context: CallContext): Promise<AuthTokenOutputDto> {
    const claims = this.tokenService.peekMfaChallenge(challengeToken)
    await this.tokenService.refuseSpentMfaChallenge(claims)

    const user: UserEntity | null = await this.userRepository.findById(claims.uid)
    if (!user) {
      throw new UnauthorizedException({
        error: "CHALLENGE_INVALID",
        message: "The account behind this challenge no longer exists"
      })
    }

    if (!user.isTwoFactorEnabled || !user.twoFactorSecret) {
      throw new UnauthorizedException({
        error: "CHALLENGE_INVALID",
        message: "This account does not have two-factor authentication enabled"
      })
    }

    const attempt: AdmittedAttempt | null = await this.signInAttempts.admitChallengeAttempt(user.email, claims)
    if (attempt === null) {
      throw new UnauthorizedException({
        error: "CHALLENGE_EXHAUSTED",
        message: "This challenge allows no more attempts; sign in again"
      })
    }

    const step: number | null = acceptedStep(user.twoFactorSecret, code)
    if (step === null) {
      this.signInAttempts.failed(
        { stage: "two_factor", reason: "wrong_code", email: user.email, user, attempt },
        context
      )
      throw new UnauthorizedException({ error: "WRONG_CODE", message: "That code is not valid" })
    }

    await this.tokenService.consumeMfaChallenge(claims)

    const fresh: boolean = await this.userRepository.acceptTwoFactorStep(user.id, step)
    if (!fresh) {
      this.signInAttempts.failed(
        { stage: "two_factor", reason: "code_reused", email: user.email, user, attempt },
        context
      )
      throw new UnauthorizedException({
        error: "CHALLENGE_SPENT",
        message: "That code has already been used; sign in again with the next one"
      })
    }

    return await this.startSession(user, context)
  }

  async register(dto: RegisterUserInputDto, context: CallContext): Promise<AuthTokenOutputDto> {
    checkedClient(context.client)

    const email: string = normalisedEmail(dto.email)
    const existingUser: UserEntity | null = await this.userRepository.findByEmail(email)
    if (existingUser) {
      throw new ConflictException("Email address is already registered")
    }

    const saltRounds: number = 10
    const passwordHash: string = await bcrypt.hash(dto.password, saltRounds)

    const newUser = new UserEntity(0, email, passwordHash, "customer")
    const savedUser: UserEntity = await this.userRepository.save(newUser)

    return await this.startSession(savedUser, context)
  }

  async refresh(refreshToken: string, context: CallContext): Promise<AuthTokenOutputDto> {
    const claims = this.tokenService.peekRefresh(refreshToken)
    const client = checkedClient(context.client)

    const sessionClient: string | null = claims.azp ?? null
    if (sessionClientDecision(sessionClient, client) === "mismatch") {
      throw this.clientGate.mismatch(sessionClient, client, context, claims.uid)
    }

    const user: UserEntity | null = await this.userRepository.findById(claims.uid)
    if (!user) {
      throw new UnauthorizedException("The account behind this token no longer exists")
    }

    if (requiresTwoFactor(user.role) && !user.isTwoFactorEnabled) {
      await this.tokenService.revokeFamily(claims.fam, "two_factor_required")
      throw new UnauthorizedException({
        error: "TWO_FACTOR_REQUIRED",
        message:
          "An admin account must use two-factor authentication, so this session has ended. Sign in " +
          "again to set it up."
      })
    }

    const principalId: string = await this.principalResolver.resolveOrMintForUser(user)

    let rotated: RotatedPair

    try {
      rotated = await this.tokenService.rotate(
        refreshToken,
        { id: user.id, email: user.email, role: user.role },
        client
      )
    } catch (error) {
      if (error instanceof ClientMismatchError) {
        throw this.clientGate.mismatch(error.sessionClient, client, context, user.id)
      }
      throw error
    }

    if (rotated.bound && client.kind === "named") {
      this.clientGate.bound(client.name, context, user.id)
    }

    const pair = rotated.pair

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

  async setupTwoFactor(
    claims: SessionClaims,
    userId: number,
    dto: TwoFactorSetupInputDto,
    context: CallContext
  ): Promise<TwoFactorSetup> {
    const user: UserEntity = await this.ownAccount(claims, userId)

    const password: string | null = this.passwordToConfirm(claims, dto.password)
    if (password !== null) {
      const attempt = await this.signInAttempts.admit(user.email)
      await this.checkPassword(user, password, attempt, context)
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

  async enableTwoFactor(
    claims: SessionClaims,
    userId: number,
    dto: TwoFactorEnableInputDto,
    context: CallContext
  ): Promise<{ enabled: true }> {
    const user: UserEntity = await this.ownAccount(claims, userId)
    const password: string | null = this.passwordToConfirm(claims, dto.password)

    const attempt = await this.signInAttempts.admit(user.email)
    if (password !== null) {
      await this.checkPassword(user, password, attempt, context)
    }

    if (!user.twoFactorSecret) {
      throw new BadRequestException("Request a two-factor secret before enabling it")
    }

    await this.acceptCode(user, user.twoFactorSecret, dto.code, attempt, context)

    if (claims.token_use === "mfa_enrolment") {
      await this.tokenService.revokeAllFamiliesForPrincipal(claims.sub, "two_factor_enabled")
      await this.tokenService.endEnrolment(claims)
    } else {
      await this.tokenService.revokeOtherSessions(claims.sub, claims.fam, "two_factor_enabled")
    }

    user.isTwoFactorEnabled = true
    await this.userRepository.save(user)

    return { enabled: true }
  }

  async disableTwoFactor(
    claims: AccessClaims,
    userId: number,
    dto: TwoFactorDisableInputDto,
    context: CallContext
  ): Promise<{ enabled: false }> {
    const user: UserEntity = await this.ownAccount(claims, userId)

    const attempt = await this.signInAttempts.admit(user.email)
    await this.checkPassword(user, dto.password, attempt, context)

    if (!user.isTwoFactorEnabled || !user.twoFactorSecret) {
      throw new ConflictException("Two-factor authentication is not enabled for this account")
    }

    await this.acceptCode(user, user.twoFactorSecret, dto.code, attempt, context)

    if (requiresTwoFactor(user.role)) {
      await this.tokenService.revokeAllFamiliesForPrincipal(claims.sub, "two_factor_disabled")
      await this.tokenService.revokeAccessJti(claims.jti, new Date(claims.exp * 1000), "two_factor_disabled")
    } else {
      await this.tokenService.revokeOtherSessions(claims.sub, claims.fam, "two_factor_disabled")
    }

    user.isTwoFactorEnabled = false
    user.twoFactorSecret = null
    await this.userRepository.save(user)

    return { enabled: false }
  }

  async startSession(user: UserEntity, context: CallContext): Promise<AuthTokenOutputDto> {
    if (requiresTwoFactor(user.role) && !user.isTwoFactorEnabled) {
      throw new Error(`refusing to start a full session for admin account ${user.id}, which has no second factor`)
    }

    const client: string | null = clientNameOf(checkedClient(context.client))

    const principalId: string = await this.principalResolver.resolveOrMintForUser(user)
    await this.principalResolver.syncKind(principalId, user.role)
    await this.signInAttempts.succeeded(user.email)

    const pair = await this.tokenService.issuePair(
      { id: user.id, email: user.email, role: user.role },
      principalId,
      client
    )

    return new AuthTokenOutputDto(pair.accessToken, pair.refreshToken, pair.expiresIn, {
      id: user.id,
      email: user.email,
      role: user.role,
      principalId
    })
  }

  private async startEnrolment(user: UserEntity, context: CallContext): Promise<TwoFactorEnrolment> {
    const client: string | null = clientNameOf(checkedClient(context.client))

    const principalId: string = await this.principalResolver.resolveOrMintForUser(user)
    await this.principalResolver.syncKind(principalId, user.role)
    await this.signInAttempts.succeeded(user.email)

    const enrolment = this.tokenService.issueEnrolment(
      { id: user.id, email: user.email, role: user.role },
      principalId,
      client
    )

    return {
      mfaEnrolmentRequired: true,
      enrolmentToken: enrolment.token,
      tokenType: "Bearer",
      expiresIn: enrolment.expiresIn,
      userId: user.id
    }
  }

  private async ownAccount(claims: SessionClaims, userId: number): Promise<UserEntity> {
    if (claims.uid !== userId) {
      throw new ForbiddenException("This account may only act on its own second factor")
    }

    const user: UserEntity | null = await this.userRepository.findById(userId)
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`)
    }

    return user
  }

  private passwordToConfirm(claims: SessionClaims, password: string | undefined): string | null {
    if (claims.token_use === "mfa_enrolment") {
      return null
    }

    if (password === undefined) {
      throw new BadRequestException({
        error: "PASSWORD_REQUIRED",
        message: "Changing the second factor from a signed-in session needs the account's current password."
      })
    }

    return password
  }

  private async checkPassword(
    user: UserEntity,
    password: string,
    attempt: AdmittedAttempt,
    context: CallContext
  ): Promise<void> {
    const isPasswordValid: boolean = await bcrypt.compare(password, user.passwordHash)
    if (!isPasswordValid) {
      this.signInAttempts.failed(
        { stage: "password", reason: "wrong_password", email: user.email, user, attempt },
        context
      )
      throw new UnauthorizedException("Invalid email or password credentials")
    }
  }

  private async acceptCode(
    user: UserEntity,
    secret: string,
    code: string,
    attempt: AdmittedAttempt,
    context: CallContext
  ): Promise<void> {
    const step: number | null = acceptedStep(secret, code)
    if (step === null) {
      this.signInAttempts.failed(
        { stage: "two_factor", reason: "wrong_code", email: user.email, user, attempt },
        context
      )
      throw new UnprocessableEntityException("That code is not valid")
    }

    const fresh: boolean = await this.userRepository.acceptTwoFactorStep(user.id, step)
    if (!fresh) {
      this.signInAttempts.failed(
        { stage: "two_factor", reason: "code_reused", email: user.email, user, attempt },
        context
      )
      throw new UnprocessableEntityException("That code has already been used; wait for the next one")
    }
  }
}

export default AuthUsecaseService
