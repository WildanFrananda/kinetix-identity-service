import MerchantVerificationEntity from "../entities/merchant_verification.entity"

interface MerchantVerificationRepositoryPort {
  findByUserId(userId: number): Promise<MerchantVerificationEntity | null>
  save(merchantVerification: MerchantVerificationEntity): Promise<MerchantVerificationEntity>
}

export default MerchantVerificationRepositoryPort
