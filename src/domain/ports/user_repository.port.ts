import UserEntity from "../entities/user.entity"

abstract class UserRepositoryPort {
  abstract findByEmail(email: string): Promise<UserEntity | null>
  abstract findById(id: number): Promise<UserEntity | null>
  abstract save(user: UserEntity): Promise<UserEntity>
}

export default UserRepositoryPort
