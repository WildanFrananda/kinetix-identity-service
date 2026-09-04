import type { AuthenticatedAccount } from "../../types/auth.type"

class AuthTokenOutputDto {
  accessToken: string
  refreshToken: string
  expiresIn: number
  tokenType: string
  user: AuthenticatedAccount

  constructor(
    accessToken: string,
    refreshToken: string,
    expiresIn: number,
    user: AuthenticatedAccount
  ) {
    this.accessToken = accessToken
    this.refreshToken = refreshToken
    this.expiresIn = expiresIn
    this.tokenType = "Bearer"
    this.user = user
  }
}

export default AuthTokenOutputDto
