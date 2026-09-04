import MerchantEntity from "../entities/merchant.entity"

interface MerchantRepositoryPort {
  findByUserId(userId: number): Promise<MerchantEntity | null>
  findBySlug(slug: string): Promise<MerchantEntity | null>
  save(merchant: MerchantEntity): Promise<MerchantEntity>
}

export default MerchantRepositoryPort
