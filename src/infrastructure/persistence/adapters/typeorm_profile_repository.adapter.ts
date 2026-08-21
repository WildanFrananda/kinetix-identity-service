import { Injectable } from "@nestjs/common"
import { InjectRepository } from "@nestjs/typeorm"
import { Repository } from "typeorm"
import ProfileEntity from "../../../domain/entities/profile.entity"
import ProfileRepositoryPort from "../../../domain/ports/profile_repository.port"
import ProfileTypeormEntity from "../entities/profile_typeorm.entity"

@Injectable()
class TypeormProfileRepositoryAdapter implements ProfileRepositoryPort {
  constructor(
    @InjectRepository(ProfileTypeormEntity)
    private readonly repo: Repository<ProfileTypeormEntity>
  ) {}

  async findByUserId(userId: number): Promise<ProfileEntity | null> {
    const record = await this.repo.findOne({ where: { userId } })
    if (!record) return null
    return new ProfileEntity(
      record.id,
      record.userId,
      record.fullName,
      record.phoneNumber,
      record.streetAddress,
      record.city,
      record.postalCode,
      record.avatarUrl
    )
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
      avatarUrl: profile.avatarUrl
    })
    const saved = await this.repo.save(entity)
    return new ProfileEntity(
      saved.id,
      saved.userId,
      saved.fullName,
      saved.phoneNumber,
      saved.streetAddress,
      saved.city,
      saved.postalCode,
      saved.avatarUrl
    )
  }
}

export default TypeormProfileRepositoryAdapter
