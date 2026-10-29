import { ConfigService } from "@nestjs/config"
import type { Provider } from "@nestjs/common"
import { relyingPartyFrom } from "../config/relying_party"
import SimpleWebAuthnCeremonyAdapter from "./simple_webauthn_ceremony.adapter"

function passkeyCeremonyFrom(config: ConfigService): SimpleWebAuthnCeremonyAdapter {
  const relyingParty = relyingPartyFrom(function (name: string): string | undefined {
    return config.get<string>(name)
  })

  return new SimpleWebAuthnCeremonyAdapter(relyingParty)
}

const PASSKEY_CEREMONY_PROVIDER: Provider = {
  provide: "PasskeyCeremonyPort",
  inject: [ConfigService],
  useFactory: passkeyCeremonyFrom
}

export { PASSKEY_CEREMONY_PROVIDER, passkeyCeremonyFrom }
