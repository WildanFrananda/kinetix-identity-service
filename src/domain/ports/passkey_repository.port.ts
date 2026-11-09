import PasskeyEntity from "../entities/passkey.entity"
import type { NewPasskey } from "../../types/new_passkey.type"
import type { PasskeyAddition } from "../../types/passkey_addition.type"

interface PasskeyRepositoryPort {
  listForUser(userId: number): Promise<PasskeyEntity[]>
  listForRelyingParty(userId: number, rpId: string): Promise<PasskeyEntity[]>
  existsForRelyingParty(userId: number, rpId: string): Promise<boolean>
  add(passkey: NewPasskey, limit: number): Promise<PasskeyAddition>
  remove(userId: number, passkeyId: string): Promise<boolean>
  recordUse(passkeyId: string, signCount: number, backedUp: boolean): Promise<boolean>
  claimUnrecorded(rpId: string): Promise<number>
}

export default PasskeyRepositoryPort
