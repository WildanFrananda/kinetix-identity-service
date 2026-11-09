import type { Provider } from "@nestjs/common"
import SimpleWebAuthnCeremonyAdapter from "./simple_webauthn_ceremony.adapter"

const PASSKEY_CEREMONY_PROVIDER: Provider = {
  provide: "PasskeyCeremonyPort",
  useClass: SimpleWebAuthnCeremonyAdapter
}

export { PASSKEY_CEREMONY_PROVIDER }
