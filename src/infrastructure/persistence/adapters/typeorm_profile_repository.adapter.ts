import { Injectable } from "@nestjs/common"
import { InjectRepository } from "@nestjs/typeorm"
import { Repository } from "typeorm"
import ProfileEntity from "../../../domain/entities/profile.entity"
import MissingReferenceError from "../../../domain/errors/missing_reference.error"
import RecordConflictError from "../../../domain/errors/record_conflict.error"
import ProfileRepositoryPort from "../../../domain/ports/profile_repository.port"
import ProfileTypeormEntity from "../entities/profile_typeorm.entity"
import { isForeignKeyViolation, isUniqueViolation } from "../sql_state"

@Injectable()
class TypeormProfileRepositoryAdapter implements ProfileRepositoryPort {
  constructor(
    @InjectRepository(ProfileTypeormEntity)
    private readonly repo: Repository<ProfileTypeormEntity>
  ) {}

  async findByUserId(userId: number): Promise<ProfileEntity | null> {
    const record = await this.repo.findOne({ where: { userId } })
    return record ? this.toEntity(record) : null
  }

  async save(profile: ProfileEntity): Promise<ProfileEntity> {
    const entity = this.repo.create({
      id: profile.id > 0 ? profile.id : undefined,
      userId: profile.userId,
      fullName: profile.fullName,
      phoneNumber: profile.phoneNumber,
      streetAddress: profile.streetAddress,
      city: profile.city,
      postalCode: profile.postalCode,
      avatarUrl: profile.avatarUrl,
      latitude: profile.latitude ?? null,
      longitude: profile.longitude ?? null,
      geocodedAt: profile.geocodedAt ?? null
    })

    let saved: ProfileTypeormEntity
    try {
      saved = await this.repo.save(entity)
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new MissingReferenceError(`No account with ID ${profile.userId}`)
      }
      if (isUniqueViolation(error)) {
        throw new RecordConflictError(
          `The profile of account ${profile.userId} was created by another request at the same time; ` +
            "read it and retry"
        )
      }
      throw error
    }

    return this.toEntity(saved)
  }

  private toEntity(record: ProfileTypeormEntity): ProfileEntity {
    return new ProfileEntity(
      record.id,
      record.userId,
      record.fullName,
      record.phoneNumber,
      record.streetAddress,
      record.city,
      record.postalCode,
      record.avatarUrl,
      record.latitude === null || record.latitude === undefined ? undefined : Number(record.latitude),
      record.longitude === null || record.longitude === undefined ? undefined : Number(record.longitude),
      record.geocodedAt ?? undefined
    )
  }
}

export default TypeormProfileRepositoryAdapter
