import PasskeyEntity from "../entities/passkey.entity"
import type { NewPasskey } from "../../types/new_passkey.type"
import type { PasskeyAddition } from "../../types/passkey_addition.type"

interface PasskeyRepositoryPort {
  listForUser(userId: number): Promise<PasskeyEntity[]>
  existsForUser(userId: number): Promise<boolean>
  add(passkey: NewPasskey, limit: number): Promise<PasskeyAddition>
  remove(userId: number, passkeyId: string): Promise<boolean>
  recordUse(passkeyId: string, signCount: number, backedUp: boolean): Promise<boolean>
}

export default PasskeyRepositoryPort
