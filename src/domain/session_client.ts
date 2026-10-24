import type { RequestClient, SessionClientDecision } from "../types/client.type"

function sessionClientDecision(sessionClient: string | null, request: RequestClient): SessionClientDecision {
  if (sessionClient === null) {
    return request.kind === "named" ? "bind" : "continue"
  }

  if (request.kind === "named" && request.name === sessionClient) {
    return "continue"
  }

  return "mismatch"
}

function checkedClient(client: RequestClient | null): RequestClient {
  if (client === null) {
    throw new Error("a session was started or renewed on a route that does not check its client")
  }

  return client
}

function clientNameOf(client: RequestClient): string | null {
  return client.kind === "named" ? client.name : null
}

export { checkedClient, clientNameOf, sessionClientDecision }
