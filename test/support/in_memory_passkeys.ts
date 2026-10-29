import { randomUUID } from "crypto"
import PasskeyEntity from "../../src/domain/entities/passkey.entity"
import PasskeyRepositoryPort from "../../src/domain/ports/passkey_repository.port"
import type { NewPasskey } from "../../src/types/new_passkey.type"
import type { PasskeyAddition } from "../../src/types/passkey_addition.type"

class InMemoryPasskeys implements PasskeyRepositoryPort {
  readonly rows: PasskeyEntity[] = []

  async listForUser(userId: number): Promise<PasskeyEntity[]> {
    return this.rows.filter(function (row: PasskeyEntity): boolean {
      return row.userId === userId
    })
  }

  async existsForUser(userId: number): Promise<boolean> {
    return (await this.listForUser(userId)).length > 0
  }

  async add(passkey: NewPasskey, limit: number): Promise<PasskeyAddition> {
    if ((await this.listForUser(passkey.userId)).length >= limit) {
      return { outcome: "limit" }
    }

    if (this.rows.some((row) => row.credentialId === passkey.credentialId)) {
      return { outcome: "duplicate" }
    }

    const added = new PasskeyEntity(
      randomUUID(),
      passkey.userId,
      passkey.credentialId,
      passkey.publicKey,
      passkey.signCount,
      passkey.transports,
      passkey.deviceType,
      passkey.backedUp,
      passkey.name,
      new Date(),
      null
    )

    this.rows.push(added)

    return { outcome: "added", passkey: added }
  }

  async remove(userId: number, passkeyId: string): Promise<boolean> {
    const index = this.rows.findIndex((row) => row.id === passkeyId && row.userId === userId)
    if (index === -1) {
      return false
    }

    this.rows.splice(index, 1)

    return true
  }

  async recordUse(passkeyId: string, signCount: number, backedUp: boolean): Promise<boolean> {
    const row = this.rows.find((candidate) => candidate.id === passkeyId)
    if (row === undefined) {
      return false
    }

    const advances = signCount === 0 ? row.signCount === 0 : row.signCount < signCount
    if (!advances) {
      return false
    }

    row.signCount = signCount
    row.backedUp = backedUp
    row.lastUsedAt = new Date()

    return true
  }
}

export default InMemoryPasskeys
