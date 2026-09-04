import { Injectable } from "@nestjs/common"
import { InjectRepository } from "@nestjs/typeorm"
import { DataSource, Repository } from "typeorm"
import PrincipalAliasTypeormEntity from "../../infrastructure/persistence/entities/principal_alias_typeorm.entity"
import PrincipalTypeormEntity from "../../infrastructure/persistence/entities/principal_typeorm.entity"
import { principalKindForRole } from "../../domain/principal_kind"
import type { UserRole } from "../../types/principal.type"
import type { TokenSubject } from "../../types/token.type"

@Injectable()
class PrincipalResolverService {
  constructor(
    @InjectRepository(PrincipalAliasTypeormEntity)
    private readonly aliasRepository: Repository<PrincipalAliasTypeormEntity>,
    @InjectRepository(PrincipalTypeormEntity)
    private readonly principalRepository: Repository<PrincipalTypeormEntity>,
    private readonly dataSource: DataSource
  ) {}

  async resolveOrMintForUser(user: TokenSubject): Promise<string> {
    const localId: string = String(user.id)

    const existing = await this.aliasRepository.findOne({ where: { service: "identity", localId } })
    if (existing) {
      return existing.principalId
    }

    const kind: string = principalKindForRole(user.role as UserRole)

    try {
      return await this.dataSource.transaction(async (manager) => {
        const principal = await manager.save(
          manager.create(PrincipalTypeormEntity, { kind, displayName: user.email })
        )
        await manager.save(
          manager.create(PrincipalAliasTypeormEntity, {
            principalId: principal.id,
            service: "identity",
            localId
          })
        )
        return principal.id
      })
    } catch (cause) {
      const winner = await this.aliasRepository.findOne({ where: { service: "identity", localId } })
      if (winner) {
        return winner.principalId
      }
      throw cause
    }
  }

  async registerAlias(principalId: string, service: string, localId: string): Promise<void> {
    const existing = await this.aliasRepository.findOne({ where: { service, localId } })
    if (existing) {
      if (existing.principalId !== principalId) {
        throw new Error(
          `${service}/${localId} already resolves to principal ${existing.principalId}; refusing to repoint it to ${principalId}`
        )
      }
      return
    }

    try {
      await this.aliasRepository.save(this.aliasRepository.create({ principalId, service, localId }))
    } catch {
      const winner = await this.aliasRepository.findOne({ where: { service, localId } })
      if (!winner || winner.principalId !== principalId) {
        throw new Error(`could not register alias ${service}/${localId}`)
      }
    }
  }

  async syncKind(principalId: string, role: string): Promise<void> {
    const kind: string = principalKindForRole(role as UserRole)
    await this.principalRepository.update({ id: principalId }, { kind })
  }
}

export default PrincipalResolverService
