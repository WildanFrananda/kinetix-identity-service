import type { PasskeyCredential } from "./passkey_credential.type"

type NewPasskey = PasskeyCredential & {
  userId: number
  name: string
}

export type { NewPasskey }
