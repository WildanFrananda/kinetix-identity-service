class ProfileEntity {
  id: number
  userId: number
  fullName: string
  phoneNumber: string
  streetAddress: string
  city: string
  postalCode: string
  avatarUrl?: string

  constructor(
    id: number,
    userId: number,
    fullName: string,
    phoneNumber: string,
    streetAddress: string,
    city: string,
    postalCode: string,
    avatarUrl?: string
  ) {
    this.id = id
    this.userId = userId
    this.fullName = fullName
    this.phoneNumber = phoneNumber
    this.streetAddress = streetAddress
    this.city = city
    this.postalCode = postalCode
    this.avatarUrl = avatarUrl
  }
}

export default ProfileEntity
