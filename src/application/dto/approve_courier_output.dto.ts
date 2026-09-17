class ApproveCourierOutputDto {
  principalId: string
  email: string
  role: string

  constructor(principalId: string, email: string, role: string) {
    this.principalId = principalId
    this.email = email
    this.role = role
  }
}

export default ApproveCourierOutputDto
