import UserEntity from "../../src/domain/entities/user.entity"
import UserRepositoryPort from "../../src/domain/ports/user_repository.port"

class InMemoryUsers implements UserRepositoryPort {
  readonly rows = new Map<number, UserEntity>()
  private readonly lastSteps = new Map<number, number>()

  add(user: UserEntity): UserEntity {
    this.rows.set(user.id, user)
    return user
  }

  async findByEmail(email: string): Promise<UserEntity | null> {
    for (const user of this.rows.values()) {
      if (user.email.toLowerCase() === email.toLowerCase()) {
        return user
      }
    }

    return null
  }

  async findById(id: number): Promise<UserEntity | null> {
    return this.rows.get(id) ?? null
  }

  async save(user: UserEntity): Promise<UserEntity> {
    this.rows.set(user.id, user)
    return user
  }

  async acceptTwoFactorStep(userId: number, step: number): Promise<boolean> {
    const last = this.lastSteps.get(userId)
    if (last !== undefined && last >= step) {
      return false
    }

    this.lastSteps.set(userId, step)
    return true
  }
}

export default InMemoryUsers
