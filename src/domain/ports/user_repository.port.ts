import UserEntity from "../entities/user.entity"

interface UserRepositoryPort {
  findByEmail(email: string): Promise<UserEntity | null>
  findById(id: number): Promise<UserEntity | null>
  save(user: UserEntity): Promise<UserEntity>
}

export default UserRepositoryPort
