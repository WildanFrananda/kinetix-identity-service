import type { PrincipalKind } from "../../types/identity_grpc.type"

const PRINCIPAL_KINDS: readonly PrincipalKind[] = [
  "PRINCIPAL_KIND_UNSPECIFIED",
  "PRINCIPAL_KIND_CUSTOMER",
  "PRINCIPAL_KIND_MERCHANT",
  "PRINCIPAL_KIND_DRIVER",
  "PRINCIPAL_KIND_STAFF",
  "PRINCIPAL_KIND_SERVICE"
]

function principalKindOf(value: string): PrincipalKind {
  return (PRINCIPAL_KINDS as readonly string[]).includes(value)
    ? (value as PrincipalKind)
    : "PRINCIPAL_KIND_UNSPECIFIED"
}

export { principalKindOf }
