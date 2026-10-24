import type { RequestClient } from "./client.type"
import type { SessionClaims } from "./token.type"

type AuthenticatedRequest = {
  headers: Record<string, string | string[] | undefined>
  params: Record<string, string>
  user?: SessionClaims
  kinetixClient?: RequestClient
}

export type { AuthenticatedRequest }
