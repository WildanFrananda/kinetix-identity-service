import type { PeerAuthContext } from "../../types/mesh.type"

const TRUST_DOMAIN = "spiffe://kinetix.local/service/"

function peerService(auth: PeerAuthContext | null): string | null {
  const subjectAltName = auth?.sslPeerCertificate?.subjectaltname
  if (!subjectAltName) {
    return null
  }

  for (const entry of subjectAltName.split(",")) {
    const trimmed = entry.trim()
    if (!trimmed.startsWith("URI:")) {
      continue
    }

    const value = trimmed.slice("URI:".length)
    let url: URL
    try {
      url = new URL(value)
    } catch {
      continue
    }

    const normalised = `${url.protocol}//${url.host}${url.pathname}`
    if (!normalised.startsWith(TRUST_DOMAIN)) {
      continue
    }

    const service = normalised.slice(TRUST_DOMAIN.length)
    if (service.length === 0 || service.includes("/")) {
      continue
    }
    return service
  }

  return null
}

export { peerService, TRUST_DOMAIN }
