class UserEntity {
  id: number
  email: string
  passwordHash: string
  role: "customer" | "seller" | "courier" | "admin"
  isTwoFactorEnabled: boolean
  twoFactorSecret?: string
  createdAt: Date
  updatedAt: Date

  constructor(
    id: number,
    email: string,
    passwordHash: string,
    role: "customer" | "seller" | "courier" | "admin",
    isTwoFactorEnabled: boolean = false,
    createdAt: Date = new Date(),
    updatedAt: Date = new Date(),
    twoFactorSecret?: string
  ) {
    this.id = id
    this.email = email
    this.passwordHash = passwordHash
    this.role = role
    this.isTwoFactorEnabled = isTwoFactorEnabled
    this.twoFactorSecret = twoFactorSecret
    this.createdAt = createdAt
    this.updatedAt = updatedAt
  }
}

export default UserEntity
