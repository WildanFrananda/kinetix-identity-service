import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException
} from "@nestjs/common"
import PasskeyEntity from "../../domain/entities/passkey.entity"
import UserEntity from "../../domain/entities/user.entity"
import PasskeyCeremonyPort from "../../domain/ports/passkey_ceremony.port"
import PasskeyChallengeRepositoryPort from "../../domain/ports/passkey_challenge_repository.port"
import PasskeyRepositoryPort from "../../domain/ports/passkey_repository.port"
import UserRepositoryPort from "../../domain/ports/user_repository.port"
import {
  PASSKEYS_PER_ACCOUNT,
  REGISTRATION_CHALLENGE_SECONDS,
  SIGN_IN_CHALLENGE_SECONDS
} from "../../domain/passkey_policy"
import AuthTokenOutputDto from "../dto/auth_token_output.dto"
import PasskeyRegistrationInputDto from "../dto/passkey_registration_input.dto"
import PasskeyRemovalInputDto from "../dto/passkey_removal_input.dto"
import AuthUsecaseService from "./auth_usecase.service"
import SignInAttemptsService from "./sign_in_attempts.service"
import TokenService from "./token.service"
import type { CallContext } from "../../types/call_context.type"
import type { PasskeyList } from "../../types/passkey_list.type"
import type { PasskeyRegistrationOptions } from "../../types/passkey_registration_options.type"
import type { PasskeySignInOptions } from "../../types/passkey_sign_in_options.type"
import type { PasskeyView } from "../../types/passkey_view.type"
import type { AdmittedAttempt, SignInFailureReason } from "../../types/sign_in_attempt.type"
import type { AccessClaims } from "../../types/token.type"

@Injectable()
class PasskeyUsecaseService {
  constructor(
    @Inject("UserRepositoryPort")
    private readonly userRepository: UserRepositoryPort,
    @Inject("PasskeyRepositoryPort")
    private readonly passkeys: PasskeyRepositoryPort,
    @Inject("PasskeyChallengeRepositoryPort")
    private readonly challenges: PasskeyChallengeRepositoryPort,
    @Inject("PasskeyCeremonyPort")
    private readonly ceremony: PasskeyCeremonyPort,
    private readonly authUsecase: AuthUsecaseService,
    private readonly tokenService: TokenService,
    private readonly signInAttempts: SignInAttemptsService
  ) {}

  async list(claims: AccessClaims, userId: number): Promise<PasskeyList> {
    const user: UserEntity = await this.ownAccount(claims, userId)
    const held: PasskeyEntity[] = await this.passkeys.listForUser(user.id)

    return { passkeys: held.map(viewOf) }
  }

  async registrationOptions(claims: AccessClaims, userId: number): Promise<PasskeyRegistrationOptions> {
    const user: UserEntity = await this.ownAccount(claims, userId)
    requireTwoFactor(user)

    const held: PasskeyEntity[] = await this.passkeys.listForUser(user.id)
    if (held.length >= PASSKEYS_PER_ACCOUNT) {
      throw limitReached()
    }

    const options = await this.ceremony.registrationOptions(
      { userHandle: claims.sub, userName: user.email },
      held,
      REGISTRATION_CHALLENGE_SECONDS
    )

    const challengeId: string = await this.challenges.issueRegistration(
      user.id,
      options.challenge,
      REGISTRATION_CHALLENGE_SECONDS
    )

    return { challengeId, options }
  }

  async register(
    claims: AccessClaims,
    userId: number,
    dto: PasskeyRegistrationInputDto,
    context: CallContext
  ): Promise<PasskeyView> {
    const user: UserEntity = await this.ownAccount(claims, userId)
    const attempt: AdmittedAttempt = await this.authUsecase.confirmPassword(user, dto.password, context)
    requireTwoFactor(user)

    const expectedChallenge: string | null = await this.challenges.spendRegistration(dto.challengeId, user.id)
    if (expectedChallenge === null) {
      throw new BadRequestException({
        error: "PASSKEY_CHALLENGE_INVALID",
        message: "That passkey challenge is unknown, expired or already used; ask for new options."
      })
    }

    const verified = await this.ceremony.verifyRegistration(dto.credential, expectedChallenge)
    if (verified.outcome === "refused") {
      this.signInAttempts.failed(
        {
          stage: "passkey",
          reason: "passkey_refused",
          email: user.email,
          user,
          attempt,
          detail: verified.detail
        },
        context
      )

      throw new BadRequestException({
        error: "PASSKEY_INVALID",
        message: "The authenticator's answer could not be verified, so no passkey was added."
      })
    }

    const added = await this.passkeys.add(
      { ...verified.credential, userId: user.id, name: dto.name.trim() },
      PASSKEYS_PER_ACCOUNT
    )
    if (added.outcome === "limit") {
      throw limitReached()
    }

    if (added.outcome === "duplicate") {
      throw new ConflictException({ error: "PASSKEY_EXISTS", message: "That passkey is already registered." })
    }

    return viewOf(added.passkey)
  }

  async remove(
    claims: AccessClaims,
    userId: number,
    passkeyId: string,
    dto: PasskeyRemovalInputDto,
    context: CallContext
  ): Promise<void> {
    const user: UserEntity = await this.ownAccount(claims, userId)
    await this.authUsecase.confirmPassword(user, dto.password, context)

    const removed: boolean = await this.passkeys.remove(user.id, passkeyId)
    if (!removed) {
      throw new NotFoundException({ error: "PASSKEY_NOT_FOUND", message: "This account has no passkey with that id." })
    }
  }

  async signInOptions(challengeToken: string): Promise<PasskeySignInOptions> {
    const { claims, user } = await this.authUsecase.openChallenge(challengeToken)

    const held: PasskeyEntity[] = await this.passkeys.listForUser(user.id)
    if (held.length === 0) {
      throw new ConflictException({
        error: "NO_PASSKEYS",
        message: "This account has no passkey; answer the challenge with the code."
      })
    }

    const options = await this.ceremony.signInOptions(held, SIGN_IN_CHALLENGE_SECONDS)
    await this.challenges.issueSignIn(user.id, claims.jti, options.challenge, SIGN_IN_CHALLENGE_SECONDS)

    return { options }
  }

  async verifySignIn(
    challengeToken: string,
    credential: Record<string, unknown>,
    context: CallContext
  ): Promise<AuthTokenOutputDto> {
    const { claims, user } = await this.authUsecase.openChallenge(challengeToken)
    const attempt: AdmittedAttempt = await this.authUsecase.admitAnswer(user, claims)

    const expectedChallenge: string | null = await this.challenges.spendSignIn(claims.jti, user.id)
    if (expectedChallenge === null) {
      throw this.refused(
        user,
        attempt,
        "no_passkey_challenge",
        "no passkey options are open for this challenge",
        context
      )
    }

    const held: PasskeyEntity[] = await this.passkeys.listForUser(user.id)

    const asserted = await this.ceremony.verifySignIn(credential, expectedChallenge, held)
    if (asserted.outcome === "refused") {
      throw this.refused(user, attempt, asserted.reason, asserted.detail, context)
    }

    await this.tokenService.consumeMfaChallenge(claims)

    const advanced: boolean = await this.passkeys.recordUse(asserted.passkey.id, asserted.signCount, asserted.backedUp)
    if (!advanced) {
      this.signInAttempts.failed(
        { stage: "passkey", reason: "sign_count_regressed", email: user.email, user, attempt },
        context
      )

      throw new UnauthorizedException({
        error: "CHALLENGE_SPENT",
        message: "That passkey signed another sign-in at the same moment; sign in again"
      })
    }

    return await this.authUsecase.startSession(user, context)
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

  private refused(
    user: UserEntity,
    attempt: AdmittedAttempt,
    reason: SignInFailureReason,
    detail: string,
    context: CallContext
  ): UnauthorizedException {
    this.signInAttempts.failed({ stage: "passkey", reason, email: user.email, user, attempt, detail }, context)

    return new UnauthorizedException({
      error: "PASSKEY_REFUSED",
      message: "That passkey was not accepted. Ask for new passkey options and try again, or answer with the code."
    })
  }
}

function requireTwoFactor(user: UserEntity): void {
  if (!user.isTwoFactorEnabled) {
    throw new ConflictException({
      error: "TWO_FACTOR_REQUIRED",
      message: "A passkey is added only to an account whose authenticator code is on, so the code is always there."
    })
  }
}

function limitReached(): ConflictException {
  return new ConflictException({
    error: "PASSKEY_LIMIT",
    message: `An account holds at most ${PASSKEYS_PER_ACCOUNT} passkeys; remove one first.`
  })
}

function viewOf(passkey: PasskeyEntity): PasskeyView {
  return {
    id: passkey.id,
    name: passkey.name,
    createdAt: passkey.createdAt.toISOString(),
    lastUsedAt: passkey.lastUsedAt === null ? null : passkey.lastUsedAt.toISOString(),
    deviceType: passkey.deviceType,
    backedUp: passkey.backedUp
  }
}

export default PasskeyUsecaseService
