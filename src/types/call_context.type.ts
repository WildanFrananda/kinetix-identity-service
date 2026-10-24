import type { RequestClient } from "./client.type"

type CallContext = {
  requestId: string | null
  client: RequestClient | null
}

export type { CallContext }
