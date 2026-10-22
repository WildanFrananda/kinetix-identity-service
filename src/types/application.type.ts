type SellerApplicationStatus = "pending" | "verified" | "rejected"

type CourierApplicationStatus = "pending" | "approved"

type SellerApplicationView = {
  applicationId: number
  userId: number
  email: string
  storeName: string
  businessRegistrationNumber: string
  taxId: string
  streetAddress: string
  city: string
  postalCode: string
  status: SellerApplicationStatus
  verifiedAt: string | null
}

type CourierApplicationView = {
  applicationId: number
  principalId: string
  userId: number
  email: string
  driverId: number | null
  status: CourierApplicationStatus
  filedAt: string
  approvedAt: string | null
}

type CourierFiling = {
  userId: number
  principalId: string
  driverId: number
}

type ApplicationQuery<S> = {
  status: S | null
  afterId: number
  limit: number
}

type ApplicationPage<V> = {
  applications: V[]
  nextAfterId: number | null
}

export type {
  ApplicationPage,
  ApplicationQuery,
  CourierApplicationStatus,
  CourierApplicationView,
  CourierFiling,
  SellerApplicationStatus,
  SellerApplicationView
}
