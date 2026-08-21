import ProfileEntity from "../entities/profile.entity"

abstract class ProfileRepositoryPort {
  abstract findByUserId(userId: number): Promise<ProfileEntity | null>
  abstract save(profile: ProfileEntity): Promise<ProfileEntity>
}

export default ProfileRepositoryPort
