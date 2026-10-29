import type { PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/server"

type PasskeyRegistrationOptions = {
  challengeId: string
  options: PublicKeyCredentialCreationOptionsJSON
}

export type { PasskeyRegistrationOptions }
