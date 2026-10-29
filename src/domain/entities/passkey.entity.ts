import type { PasskeyDeviceType } from "../../types/passkey_device_type.type"

class PasskeyEntity {
  id: string
  userId: number
  credentialId: string
  publicKey: Uint8Array<ArrayBuffer>
  signCount: number
  transports: string[]
  deviceType: PasskeyDeviceType
  backedUp: boolean
  name: string
  createdAt: Date
  lastUsedAt: Date | null

  constructor(
    id: string,
    userId: number,
    credentialId: string,
    publicKey: Uint8Array<ArrayBuffer>,
    signCount: number,
    transports: string[],
    deviceType: PasskeyDeviceType,
    backedUp: boolean,
    name: string,
    createdAt: Date,
    lastUsedAt: Date | null
  ) {
    this.id = id
    this.userId = userId
    this.credentialId = credentialId
    this.publicKey = publicKey
    this.signCount = signCount
    this.transports = transports
    this.deviceType = deviceType
    this.backedUp = backedUp
    this.name = name
    this.createdAt = createdAt
    this.lastUsedAt = lastUsedAt
  }
}

export default PasskeyEntity
