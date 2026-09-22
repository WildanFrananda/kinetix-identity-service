import MerchantEntity from "./merchant.entity"

class MerchantChange {
  merchant: MerchantEntity
  updatedAt: Date

  constructor(merchant: MerchantEntity, updatedAt: Date) {
    this.merchant = merchant
    this.updatedAt = updatedAt
  }
}

export default MerchantChange
