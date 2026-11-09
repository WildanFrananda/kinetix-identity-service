import { ConfigService } from "@nestjs/config"
import type { Provider } from "@nestjs/common"
import RelyingParties from "../../domain/relying_parties"
import { relyingPartiesFrom } from "../config/relying_party"

function relyingPartiesProvidedBy(config: ConfigService): RelyingParties {
  const parties = relyingPartiesFrom(function (name: string): string | undefined {
    return config.get<string>(name)
  })

  return new RelyingParties(parties)
}

const RELYING_PARTIES_PROVIDER: Provider = {
  provide: RelyingParties,
  inject: [ConfigService],
  useFactory: relyingPartiesProvidedBy
}

export { RELYING_PARTIES_PROVIDER, relyingPartiesProvidedBy }
