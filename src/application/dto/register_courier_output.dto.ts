import type { AuthenticatedAccount } from "../../types/auth.type"

class RegisterCourierOutputDto {
  accessToken: string
  refreshToken: string
  expiresIn: number
  tokenType: string
  user: AuthenticatedAccount
  vehiclePlate: string
  capacityKg: number

  constructor(
    accessToken: string,
    refreshToken: string,
    expiresIn: number,
    user: AuthenticatedAccount,
    vehiclePlate: string,
    capacityKg: number
  ) {
    this.accessToken = accessToken
    this.refreshToken = refreshToken
    this.expiresIn = expiresIn
    this.tokenType = "Bearer"
    this.user = user
    this.vehiclePlate = vehiclePlate
    this.capacityKg = capacityKg
  }
}

export default RegisterCourierOutputDto
