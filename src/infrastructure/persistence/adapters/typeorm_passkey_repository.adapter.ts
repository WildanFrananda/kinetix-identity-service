import { Injectable } from "@nestjs/common"
import { InjectRepository } from "@nestjs/typeorm"
import { IsNull, Not, Repository } from "typeorm"
import PasskeyEntity from "../../../domain/entities/passkey.entity"
import MissingReferenceError from "../../../domain/errors/missing_reference.error"
import PasskeyRepositoryPort from "../../../domain/ports/passkey_repository.port"
import type { NewPasskey } from "../../../types/new_passkey.type"
import type { PasskeyAddition } from "../../../types/passkey_addition.type"
import PasskeyTypeormEntity from "../entities/passkey_typeorm.entity"

@Injectable()
class TypeormPasskeyRepositoryAdapter implements PasskeyRepositoryPort {
  constructor(
    @InjectRepository(PasskeyTypeormEntity)
    private readonly repo: Repository<PasskeyTypeormEntity>
  ) {}

  async listForUser(userId: number): Promise<PasskeyEntity[]> {
    const records = await this.repo.find({
      where: { userId, rpId: Not(IsNull()) },
      order: { createdAt: "ASC", id: "ASC" }
    })

    return records.map(passkeyOf)
  }

  async listForRelyingParty(userId: number, rpId: string): Promise<PasskeyEntity[]> {
    const records = await this.repo.find({ where: { userId, rpId }, order: { createdAt: "ASC", id: "ASC" } })

    return records.map(passkeyOf)
  }

  async existsForRelyingParty(userId: number, rpId: string): Promise<boolean> {
    return await this.repo.exists({ where: { userId, rpId } })
  }

  async add(passkey: NewPasskey, limit: number): Promise<PasskeyAddition> {
    return await this.repo.manager.transaction(async (manager): Promise<PasskeyAddition> => {
      const owners: { id: number }[] = await manager.query(`SELECT "id" FROM "users" WHERE "id" = $1 FOR UPDATE`, [
        passkey.userId
      ])
      if (owners.length === 0) {
        throw new MissingReferenceError(`User with ID ${passkey.userId} not found`)
      }

      const passkeys = manager.getRepository(PasskeyTypeormEntity)

      const held = await passkeys.count({ where: { userId: passkey.userId } })
      if (held >= limit) {
        return { outcome: "limit" }
      }

      const inserted: { id: string }[] = await manager.query(
        `INSERT INTO "passkeys"
           ("userId", "rpId", "credentialId", "publicKey", "signCount", "transports", "deviceType", "backedUp", "name")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT ("credentialId") DO NOTHING
         RETURNING "id"`,
        [
          passkey.userId,
          passkey.rpId,
          passkey.credentialId,
          Buffer.from(passkey.publicKey),
          passkey.signCount,
          passkey.transports,
          passkey.deviceType,
          passkey.backedUp,
          passkey.name
        ]
      )

      const id = inserted[0]?.id
      if (id === undefined) {
        return { outcome: "duplicate" }
      }

      return { outcome: "added", passkey: passkeyOf(await passkeys.findOneByOrFail({ id })) }
    })
  }

  async remove(userId: number, passkeyId: string): Promise<boolean> {
    const result = await this.repo.delete({ id: passkeyId, userId })

    return result.affected === 1
  }

  async recordUse(passkeyId: string, signCount: number, backedUp: boolean): Promise<boolean> {
    const advances = signCount === 0 ? `"signCount" = 0` : `"signCount" < :signCount`

    const result = await this.repo
      .createQueryBuilder()
      .update(PasskeyTypeormEntity)
      .set({ signCount: String(signCount), backedUp, lastUsedAt: () => "now()" })
      .where("id = :passkeyId", { passkeyId })
      .andWhere(advances, { signCount })
      .execute()

    return result.affected === 1
  }

  async claimUnrecorded(rpId: string): Promise<number> {
    const result = await this.repo.update({ rpId: IsNull() }, { rpId })

    return result.affected ?? 0
  }
}

function passkeyOf(record: PasskeyTypeormEntity): PasskeyEntity {
  if (record.rpId === null) {
    throw new Error(`passkey ${record.id} records no relying party; identity claims those when it starts`)
  }

  return new PasskeyEntity(
    record.id,
    record.userId,
    record.rpId,
    record.credentialId,
    new Uint8Array(record.publicKey),
    Number(record.signCount),
    record.transports,
    record.deviceType,
    record.backedUp,
    record.name,
    record.createdAt,
    record.lastUsedAt ?? null
  )
}

export default TypeormPasskeyRepositoryAdapter
