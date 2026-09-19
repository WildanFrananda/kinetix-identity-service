import type { AuthenticatedAccount } from "../../types/auth.type"

class RegisterCourierOutputDto {
  accessToken: string
  refreshToken: string
  expiresIn: number
  tokenType: string
  user: AuthenticatedAccount
  driverId: number

  constructor(
    accessToken: string,
    refreshToken: string,
    expiresIn: number,
    user: AuthenticatedAccount,
    driverId: number
  ) {
    this.accessToken = accessToken
    this.refreshToken = refreshToken
    this.expiresIn = expiresIn
    this.tokenType = "Bearer"
    this.user = user
    this.driverId = driverId
  }
}

export default RegisterCourierOutputDto
