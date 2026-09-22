import MerchantChange from "./merchant_change.entity"

class MerchantChangePage {
  changes: MerchantChange[]
  hasMore: boolean

  constructor(changes: MerchantChange[], hasMore: boolean) {
    this.changes = changes
    this.hasMore = hasMore
  }
}

export default MerchantChangePage
