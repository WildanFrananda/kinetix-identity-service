class AuthTokenOutputDto {
  accessToken: string
  expiresIn: number
  user: {
    id: number
    email: string
    role: string
  }

  constructor(accessToken: string, expiresIn: number, user: { id: number; email: string; role: string }) {
    this.accessToken = accessToken
    this.expiresIn = expiresIn
    this.user = user
  }
}

export default AuthTokenOutputDto
