import MerchantChange from "./merchant_change.entity"

class MerchantChangePage {
  changes: MerchantChange[]
  hasMore: boolean
  lastTransactionId: string | null

  constructor(changes: MerchantChange[], hasMore: boolean, lastTransactionId: string | null = null) {
    this.changes = changes
    this.hasMore = hasMore
    this.lastTransactionId = lastTransactionId
  }
}

export default MerchantChangePage
