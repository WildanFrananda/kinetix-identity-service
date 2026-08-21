import MerchantEntity from "../entities/merchant.entity"

abstract class MerchantRepositoryPort {
  abstract findByUserId(userId: number): Promise<MerchantEntity | null>
  abstract findByApiKey(apiKey: string): Promise<MerchantEntity | null>
  abstract save(merchant: MerchantEntity): Promise<MerchantEntity>
}

export default MerchantRepositoryPort
