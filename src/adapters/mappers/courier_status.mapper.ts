import type { CourierStatus } from "../../types/identity_grpc.type"

function courierStatusOf(status: string): CourierStatus {
  switch (status) {
    case "pending":
      return "COURIER_STATUS_PENDING"
    case "approved":
      return "COURIER_STATUS_APPROVED"
    case "rejected":
      return "COURIER_STATUS_REJECTED"
    default:
      return "COURIER_STATUS_UNSPECIFIED"
  }
}

export { courierStatusOf }
