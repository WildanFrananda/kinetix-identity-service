import { Injectable } from "@nestjs/common"
import { InjectRepository } from "@nestjs/typeorm"
import { Repository } from "typeorm"
import UserEntity from "../../../domain/entities/user.entity"
import RecordConflictError from "../../../domain/errors/record_conflict.error"
import UserRepositoryPort from "../../../domain/ports/user_repository.port"
import UserTypeormEntity from "../entities/user_typeorm.entity"
import { isUniqueViolation } from "../sql_state"

@Injectable()
class TypeormUserRepositoryAdapter implements UserRepositoryPort {
  constructor(
    @InjectRepository(UserTypeormEntity)
    private readonly repo: Repository<UserTypeormEntity>
  ) {}

  async findByEmail(email: string): Promise<UserEntity | null> {
    const record = await this.repo
      .createQueryBuilder("account")
      .where("lower(account.email) = lower(:email)", { email })
      .getOne()

    return record ? this.toEntity(record) : null
  }

  async findById(id: number): Promise<UserEntity | null> {
    const record = await this.repo.findOne({ where: { id } })
    return record ? this.toEntity(record) : null
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

    let saved: UserTypeormEntity
    try {
      saved = await this.repo.save(entity)
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new RecordConflictError("Email address is already registered")
      }
      throw error
    }

    return this.toEntity(saved)
  }

  async acceptTwoFactorStep(userId: number, step: number): Promise<boolean> {
    const result = await this.repo
      .createQueryBuilder()
      .update(UserTypeormEntity)
      .set({ twoFactorLastStep: step })
      .where("id = :userId", { userId })
      .andWhere('("twoFactorLastStep" IS NULL OR "twoFactorLastStep" < :step)', { step })
      .execute()

    return result.affected === 1
  }

  private toEntity(record: UserTypeormEntity): UserEntity {
    return new UserEntity(
      record.id,
      record.email,
      record.passwordHash,
      record.role,
      record.isTwoFactorEnabled,
      record.createdAt,
      record.updatedAt,
      record.twoFactorSecret ?? null
    )
  }
}

export default TypeormUserRepositoryAdapter
