import MerchantVerificationEntity from "../entities/merchant_verification.entity"
import type {
  ApplicationPage,
  ApplicationQuery,
  SellerApplicationStatus,
  SellerApplicationView
} from "../../types/application.type"

interface MerchantVerificationRepositoryPort {
  findByUserId(userId: number): Promise<MerchantVerificationEntity | null>
  save(merchantVerification: MerchantVerificationEntity): Promise<MerchantVerificationEntity>
  list(query: ApplicationQuery<SellerApplicationStatus>): Promise<ApplicationPage<SellerApplicationView>>
}

export default MerchantVerificationRepositoryPort
