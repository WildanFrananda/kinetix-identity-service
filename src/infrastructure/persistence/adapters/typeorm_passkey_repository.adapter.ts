import { Injectable } from "@nestjs/common"
import { InjectRepository } from "@nestjs/typeorm"
import { Repository } from "typeorm"
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
    const records = await this.repo.find({ where: { userId }, order: { createdAt: "ASC", id: "ASC" } })

    return records.map(passkeyOf)
  }

  async existsForUser(userId: number): Promise<boolean> {
    return await this.repo.exists({ where: { userId } })
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
           ("userId", "credentialId", "publicKey", "signCount", "transports", "deviceType", "backedUp", "name")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT ("credentialId") DO NOTHING
         RETURNING "id"`,
        [
          passkey.userId,
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
}

function passkeyOf(record: PasskeyTypeormEntity): PasskeyEntity {
  return new PasskeyEntity(
    record.id,
    record.userId,
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
