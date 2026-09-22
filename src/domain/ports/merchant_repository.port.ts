import MerchantEntity from "../entities/merchant.entity"
import MerchantChangePage from "../entities/merchant_change_page.entity"

interface MerchantRepositoryPort {
  findById(id: number): Promise<MerchantEntity | null>
  findByUserId(userId: number): Promise<MerchantEntity | null>
  findBySlug(slug: string): Promise<MerchantEntity | null>
  findChangedSince(
    updatedThrough: Date | null,
    lastId: number,
    limit: number
  ): Promise<MerchantChangePage>
  save(merchant: MerchantEntity): Promise<MerchantEntity>
}

export default MerchantRepositoryPort
