import type { AccessClaims } from "./token.type"

type AuthenticatedRequest = {
  headers: Record<string, string | string[] | undefined>
  params: Record<string, string>
  user?: AccessClaims
}

export type { AuthenticatedRequest }
