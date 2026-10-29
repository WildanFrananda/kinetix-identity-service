import type { PasskeyDeviceType } from "./passkey_device_type.type"

type PasskeyCredential = {
  credentialId: string
  publicKey: Uint8Array<ArrayBuffer>
  signCount: number
  transports: string[]
  deviceType: PasskeyDeviceType
  backedUp: boolean
}

export type { PasskeyCredential }
