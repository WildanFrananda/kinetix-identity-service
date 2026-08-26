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

  constructor(
    id: number,
    userId: number,
    storeName: string,
    slug: string,
    businessRegistrationNumber: string,
    taxId: string,
    status: "pending" | "verified" | "active" | "suspended" = "pending",
    description?: string,
    verifiedAt?: Date
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
  }
}

export default MerchantEntity
