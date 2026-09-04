import ProfileEntity from "../entities/profile.entity"

interface ProfileRepositoryPort {
  findByUserId(userId: number): Promise<ProfileEntity | null>
  save(profile: ProfileEntity): Promise<ProfileEntity>
}

export default ProfileRepositoryPort
