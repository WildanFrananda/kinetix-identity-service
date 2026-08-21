class MerchantVerificationEntity {
  id: number
  userId: number
  storeName: string
  businessRegistrationNumber: string
  taxId: string
  status: "pending" | "verified" | "rejected"
  verifiedAt?: Date

  constructor(
    id: number,
    userId: number,
    storeName: string,
    businessRegistrationNumber: string,
    taxId: string,
    status: "pending" | "verified" | "rejected" = "pending",
    verifiedAt?: Date
  ) {
    this.id = id
    this.userId = userId
    this.storeName = storeName
    this.businessRegistrationNumber = businessRegistrationNumber
    this.taxId = taxId
    this.status = status
    this.verifiedAt = verifiedAt
  }
}

export default MerchantVerificationEntity
