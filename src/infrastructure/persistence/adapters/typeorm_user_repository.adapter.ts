import { Injectable } from "@nestjs/common"
import { InjectRepository } from "@nestjs/typeorm"
import { Repository } from "typeorm"
import UserEntity from "../../../domain/entities/user.entity"
import UserRepositoryPort from "../../../domain/ports/user_repository.port"
import UserTypeormEntity from "../entities/user_typeorm.entity"

@Injectable()
class TypeormUserRepositoryAdapter implements UserRepositoryPort {
  constructor(
    @InjectRepository(UserTypeormEntity)
    private readonly repo: Repository<UserTypeormEntity>
  ) {}

  async findByEmail(email: string): Promise<UserEntity | null> {
    const record = await this.repo.findOne({ where: { email } })
    if (!record) return null
    return new UserEntity(
      record.id,
      record.email,
      record.passwordHash,
      record.role,
      record.isTwoFactorEnabled,
      record.createdAt,
      record.updatedAt,
      record.twoFactorSecret
    )
  }

  async findById(id: number): Promise<UserEntity | null> {
    const record = await this.repo.findOne({ where: { id } })
    if (!record) return null
    return new UserEntity(
      record.id,
      record.email,
      record.passwordHash,
      record.role,
      record.isTwoFactorEnabled,
      record.createdAt,
      record.updatedAt,
      record.twoFactorSecret
    )
  }

  async save(user: UserEntity): Promise<UserEntity> {
    const entity = this.repo.create({
      id: user.id > 0 ? user.id : undefined,
      email: user.email,
      passwordHash: user.passwordHash,
      role: user.role,
      isTwoFactorEnabled: user.isTwoFactorEnabled,
      twoFactorSecret: user.twoFactorSecret
    })
    const saved = await this.repo.save(entity)
    return new UserEntity(
      saved.id,
      saved.email,
      saved.passwordHash,
      saved.role,
      saved.isTwoFactorEnabled,
      saved.createdAt,
      saved.updatedAt,
      saved.twoFactorSecret
    )
  }
}

export default TypeormUserRepositoryAdapter
