import type { MerchantStatus } from "../../types/identity_grpc.type"

function merchantStatusOf(status: string): MerchantStatus {
  switch (status) {
    case "pending":
      return "MERCHANT_STATUS_PENDING"
    case "verified":
      return "MERCHANT_STATUS_VERIFIED"
    case "suspended":
      return "MERCHANT_STATUS_SUSPENDED"
    case "closed":
      return "MERCHANT_STATUS_CLOSED"
    default:
      return "MERCHANT_STATUS_UNSPECIFIED"
  }
}

export { merchantStatusOf }
