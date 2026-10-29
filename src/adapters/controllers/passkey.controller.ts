import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards
} from "@nestjs/common"
import { Throttle, ThrottlerGuard } from "@nestjs/throttler"
import PasskeyUsecaseService from "../../application/services/passkey_usecase.service"
import AuthTokenOutputDto from "../../application/dto/auth_token_output.dto"
import PasskeyOptionsInputDto from "../../application/dto/passkey_options_input.dto"
import PasskeyRegistrationInputDto from "../../application/dto/passkey_registration_input.dto"
import PasskeyRemovalInputDto from "../../application/dto/passkey_removal_input.dto"
import PasskeyVerifyInputDto from "../../application/dto/passkey_verify_input.dto"
import type { CallContext } from "../../types/call_context.type"
import type { PasskeyList } from "../../types/passkey_list.type"
import type { PasskeyRegistrationOptions } from "../../types/passkey_registration_options.type"
import type { PasskeySignInOptions } from "../../types/passkey_sign_in_options.type"
import type { PasskeyView } from "../../types/passkey_view.type"
import type { AccessClaims } from "../../types/token.type"
import { AccountIdParam } from "../decorators/account_id_param.decorator"
import { AdminAudit } from "../decorators/admin_audit.decorator"
import { CurrentUser, Public } from "../decorators/auth.decorators"
import { RequestContext } from "../decorators/request_context.decorator"
import ClientProofGuard from "../guards/client_proof.guard"
import SelfOrStaffGuard, { OwnerParam } from "../guards/self_or_staff.guard"

@Controller("api/v1/auth")
@UseGuards(ThrottlerGuard)
class PasskeyController {
  constructor(private readonly passkeyUsecase: PasskeyUsecaseService) {}

  @Public()
  @Post("2fa/passkey/options")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @UseGuards(ClientProofGuard)
  async signInOptions(@Body() dto: PasskeyOptionsInputDto): Promise<PasskeySignInOptions> {
    return await this.passkeyUsecase.signInOptions(dto.challengeToken)
  }

  @Public()
  @Post("2fa/passkey/verify")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @UseGuards(ClientProofGuard)
  async verifySignIn(
    @Body() dto: PasskeyVerifyInputDto,
    @RequestContext() context: CallContext
  ): Promise<AuthTokenOutputDto> {
    return await this.passkeyUsecase.verifySignIn(dto.challengeToken, dto.credential, context)
  }

  @Get("passkeys/:id")
  @HttpCode(HttpStatus.OK)
  @UseGuards(SelfOrStaffGuard)
  @OwnerParam("id")
  @AdminAudit("identity.passkeys_list", "id")
  async list(@CurrentUser() claims: AccessClaims, @AccountIdParam("id") userId: number): Promise<PasskeyList> {
    return await this.passkeyUsecase.list(claims, userId)
  }

  @Post("passkeys/:id/options")
  @HttpCode(HttpStatus.OK)
  @UseGuards(SelfOrStaffGuard)
  @OwnerParam("id")
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @AdminAudit("identity.passkey_options", "id")
  async registrationOptions(
    @CurrentUser() claims: AccessClaims,
    @AccountIdParam("id") userId: number
  ): Promise<PasskeyRegistrationOptions> {
    return await this.passkeyUsecase.registrationOptions(claims, userId)
  }

  @Post("passkeys/:id")
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(SelfOrStaffGuard)
  @OwnerParam("id")
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @AdminAudit("identity.passkey_add", "id")
  async register(
    @CurrentUser() claims: AccessClaims,
    @AccountIdParam("id") userId: number,
    @Body() dto: PasskeyRegistrationInputDto,
    @RequestContext() context: CallContext
  ): Promise<PasskeyView> {
    return await this.passkeyUsecase.register(claims, userId, dto, context)
  }

  @Delete("passkeys/:id/:passkeyId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(SelfOrStaffGuard)
  @OwnerParam("id")
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @AdminAudit("identity.passkey_remove", "id")
  async remove(
    @CurrentUser() claims: AccessClaims,
    @AccountIdParam("id") userId: number,
    @Param("passkeyId", new ParseUUIDPipe()) passkeyId: string,
    @Body() dto: PasskeyRemovalInputDto,
    @RequestContext() context: CallContext
  ): Promise<void> {
    await this.passkeyUsecase.remove(claims, userId, passkeyId, dto, context)
  }
}

export default PasskeyController
