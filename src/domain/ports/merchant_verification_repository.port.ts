import MerchantVerificationEntity from "../entities/merchant_verification.entity"
import type {
  ApplicationPage,
  ApplicationTally,
  ApplicationQuery,
  SellerApplicationStatus,
  SellerApplicationView
} from "../../types/application.type"

interface MerchantVerificationRepositoryPort {
  findByUserId(userId: number): Promise<MerchantVerificationEntity | null>
  save(merchantVerification: MerchantVerificationEntity): Promise<MerchantVerificationEntity>
  list(query: ApplicationQuery<SellerApplicationStatus>): Promise<ApplicationPage<SellerApplicationView>>
  tally(since: Date): Promise<ApplicationTally>
}

export default MerchantVerificationRepositoryPort
