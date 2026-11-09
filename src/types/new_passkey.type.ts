import type { PasskeyCredential } from "./passkey_credential.type"

type NewPasskey = PasskeyCredential & {
  userId: number
  rpId: string
  name: string
}

export type { NewPasskey }
