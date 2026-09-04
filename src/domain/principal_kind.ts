import type { PrincipalKind, UserRole } from "../types/principal.type"

function principalKindForRole(role: UserRole): PrincipalKind {
  switch (role) {
    case "customer":
      return "PRINCIPAL_KIND_CUSTOMER"
    case "seller":
      return "PRINCIPAL_KIND_MERCHANT"
    case "courier":
      return "PRINCIPAL_KIND_DRIVER"
    case "admin":
      return "PRINCIPAL_KIND_STAFF"
    default: {
      const unreachable: never = role
      throw new Error(`no principal kind is defined for role ${String(unreachable)}`)
    }
  }
}

export { principalKindForRole }
