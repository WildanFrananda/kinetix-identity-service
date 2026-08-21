import MerchantVerificationEntity from "../entities/merchant_verification.entity"

abstract class MerchantVerificationRepositoryPort {
  abstract findByUserId(userId: number): Promise<MerchantVerificationEntity | null>
  abstract save(merchantVerification: MerchantVerificationEntity): Promise<MerchantVerificationEntity>
}

export default MerchantVerificationRepositoryPort
