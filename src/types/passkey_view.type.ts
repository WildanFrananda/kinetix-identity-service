import type { PasskeyDeviceType } from "./passkey_device_type.type"

type PasskeyView = {
  id: string
  credentialId: string
  name: string
  createdAt: string
  lastUsedAt: string | null
  deviceType: PasskeyDeviceType
  backedUp: boolean
}

export type { PasskeyView }
