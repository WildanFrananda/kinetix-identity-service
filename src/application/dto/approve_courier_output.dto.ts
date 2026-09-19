class ApproveCourierOutputDto {
  principalId: string
  email: string
  role: string
  driverId: number | null
  fleetActivated: boolean

  constructor(
    principalId: string,
    email: string,
    role: string,
    driverId: number | null,
    fleetActivated: boolean
  ) {
    this.principalId = principalId
    this.email = email
    this.role = role
    this.driverId = driverId
    this.fleetActivated = fleetActivated
  }
}

export default ApproveCourierOutputDto
