class ProfileEntity {
  id: number
  userId: number
  fullName: string
  phoneNumber: string
  streetAddress: string
  city: string
  postalCode: string
  avatarUrl?: string
  latitude?: number
  longitude?: number
  geocodedAt?: Date

  constructor(
    id: number,
    userId: number,
    fullName: string,
    phoneNumber: string,
    streetAddress: string,
    city: string,
    postalCode: string,
    avatarUrl?: string,
    latitude?: number,
    longitude?: number,
    geocodedAt?: Date
  ) {
    this.id = id
    this.userId = userId
    this.fullName = fullName
    this.phoneNumber = phoneNumber
    this.streetAddress = streetAddress
    this.city = city
    this.postalCode = postalCode
    this.avatarUrl = avatarUrl
    this.latitude = latitude
    this.longitude = longitude
    this.geocodedAt = geocodedAt
  }
}

export default ProfileEntity
