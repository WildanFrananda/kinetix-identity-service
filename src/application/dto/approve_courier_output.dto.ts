class ApproveCourierOutputDto {
  principalId: string
  email: string
  role: string
  vehiclePlate: string | null
  capacityKg: number

  constructor(
    principalId: string,
    email: string,
    role: string,
    vehiclePlate: string | null,
    capacityKg: number
  ) {
    this.principalId = principalId
    this.email = email
    this.role = role
    this.vehiclePlate = vehiclePlate
    this.capacityKg = capacityKg
  }
}

export default ApproveCourierOutputDto
