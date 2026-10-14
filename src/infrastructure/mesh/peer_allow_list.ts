import type { PeerAllowList } from "../../types/peer_allow_list.type"

const SCHEMA_SERVICES: ReadonlySet<string> = new Set([
  "grpc.reflection.v1.ServerReflection",
  "grpc.reflection.v1alpha.ServerReflection"
])

function parsePeerAllowList(raw: string): PeerAllowList {
  const grants = new Map<string, Set<string> | null>()

  const entries = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)

  for (const entry of entries) {
    const at = entry.indexOf("@")
    if (at < 0) {
      grants.set(entry, null)
      continue
    }

    const peer = entry.slice(0, at)
    const scope = entry.slice(at + 1).replace(/^\/+/, "")

    if (peer.length === 0 || scope.length === 0) {
      throw new Error(
        `'${entry}' in GRPC_ALLOWED_CALLERS names no peer or no scope; write peer, ` +
          "peer@package.Service or peer@package.Service/Method."
      )
    }

    if (grants.has(peer)) {
      grants.get(peer)?.add(scope)
      continue
    }

    grants.set(peer, new Set([scope]))
  }

  return { grants }
}

function names(allowed: PeerAllowList, peer: string): boolean {
  return allowed.grants.has(peer)
}

function permits(allowed: PeerAllowList, peer: string, method: string): boolean {
  if (!allowed.grants.has(peer)) {
    return false
  }

  const scopes = allowed.grants.get(peer)
  if (scopes === null || scopes === undefined) {
    return true
  }

  const called = method.replace(/^\/+/, "")
  const slash = called.indexOf("/")
  const service = slash < 0 ? called : called.slice(0, slash)

  return scopes.has(called) || scopes.has(service) || SCHEMA_SERVICES.has(service)
}

function summarise(allowed: PeerAllowList): string {
  return [...allowed.grants.entries()]
    .map(([peer, scopes]) => (scopes === null ? peer : `${peer} (${[...scopes].join(", ")})`))
    .join("; ")
}

export { parsePeerAllowList, names, permits, summarise }
