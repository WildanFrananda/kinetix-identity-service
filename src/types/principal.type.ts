type UserRole = "customer" | "seller" | "courier" | "admin"

type PrincipalKind =
  | "PRINCIPAL_KIND_CUSTOMER"
  | "PRINCIPAL_KIND_MERCHANT"
  | "PRINCIPAL_KIND_DRIVER"
  | "PRINCIPAL_KIND_STAFF"
  | "PRINCIPAL_KIND_SERVICE"

export type { PrincipalKind, UserRole }
