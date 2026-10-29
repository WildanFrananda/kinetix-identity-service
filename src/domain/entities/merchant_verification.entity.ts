class MerchantVerificationEntity {
  id: number
  userId: number
  storeName: string
  businessRegistrationNumber: string
  taxId: string
  status: "pending" | "verified" | "rejected"
  verifiedAt?: Date
  streetAddress: string
  city: string
  postalCode: string
  rejectedAt?: Date

  constructor(
    id: number,
    userId: number,
    storeName: string,
    businessRegistrationNumber: string,
    taxId: string,
    status: "pending" | "verified" | "rejected" = "pending",
    verifiedAt?: Date,
    streetAddress = "",
    city = "",
    postalCode = "",
    rejectedAt?: Date
  ) {
    this.id = id
    this.userId = userId
    this.storeName = storeName
    this.businessRegistrationNumber = businessRegistrationNumber
    this.taxId = taxId
    this.status = status
    this.verifiedAt = verifiedAt
    this.streetAddress = streetAddress
    this.city = city
    this.postalCode = postalCode
    this.rejectedAt = rejectedAt
  }
}

export default MerchantVerificationEntity
