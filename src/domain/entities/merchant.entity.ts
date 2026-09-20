class MerchantEntity {
  id: number
  userId: number
  storeName: string
  slug: string
  description?: string
  businessRegistrationNumber: string
  taxId: string
  status: "pending" | "verified" | "active" | "suspended"
  verifiedAt?: Date
  streetAddress: string
  city: string
  postalCode: string
  latitude?: number
  longitude?: number
  geocodedAt?: Date

  constructor(
    id: number,
    userId: number,
    storeName: string,
    slug: string,
    businessRegistrationNumber: string,
    taxId: string,
    status: "pending" | "verified" | "active" | "suspended" = "pending",
    description?: string,
    verifiedAt?: Date,
    streetAddress = "",
    city = "",
    postalCode = "",
    latitude?: number,
    longitude?: number,
    geocodedAt?: Date
  ) {
    this.id = id
    this.userId = userId
    this.storeName = storeName
    this.slug = slug
    this.businessRegistrationNumber = businessRegistrationNumber
    this.taxId = taxId
    this.status = status
    this.description = description
    this.verifiedAt = verifiedAt
    this.streetAddress = streetAddress
    this.city = city
    this.postalCode = postalCode
    this.latitude = latitude
    this.longitude = longitude
    this.geocodedAt = geocodedAt
  }
}

export default MerchantEntity
