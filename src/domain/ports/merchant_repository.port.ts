import MerchantEntity from "../entities/merchant.entity"

interface MerchantRepositoryPort {
  findById(id: number): Promise<MerchantEntity | null>
  findByUserId(userId: number): Promise<MerchantEntity | null>
  findBySlug(slug: string): Promise<MerchantEntity | null>
  save(merchant: MerchantEntity): Promise<MerchantEntity>
}

export default MerchantRepositoryPort
