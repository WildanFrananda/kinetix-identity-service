import { Inject, Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common"
import PasskeyRepositoryPort from "../../domain/ports/passkey_repository.port"
import RelyingParties from "../../domain/relying_parties"

@Injectable()
class PasskeyRelyingPartyClaimService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PasskeyRelyingPartyClaimService.name)

  constructor(
    @Inject("PasskeyRepositoryPort")
    private readonly passkeys: PasskeyRepositoryPort,
    private readonly relyingParties: RelyingParties
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const claimed: number = await this.passkeys.claimUnrecorded(this.relyingParties.first.id)
    if (claimed === 0) {
      return
    }

    this.logger.log({
      message: "passkeys_relying_party_claimed",
      fields: { event: "passkeys_relying_party_claimed", passkeys: claimed }
    })
  }
}

export default PasskeyRelyingPartyClaimService
