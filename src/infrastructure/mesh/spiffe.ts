import type { PeerAuthContext } from "../../types/mesh.type"

const DEFAULT_TRUST_DOMAIN = "kinetix.local"

const trustDomain = process.env.KINETIX_TRUST_DOMAIN?.trim() || DEFAULT_TRUST_DOMAIN

const TRUST_DOMAIN = `spiffe://${trustDomain}/service/`

function serviceOf(id: string, prefix: string): string | null {
  if (!id.startsWith(prefix)) {
    return null
  }

  const service = id.slice(prefix.length)
  if (service.length === 0 || service.includes("/")) {
    return null
  }

  return service
}

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
    const service = serviceOf(normalised, TRUST_DOMAIN)
    if (service === null) {
      continue
    }
    return service
  }

  return null
}

export { peerService, serviceOf, trustDomain, TRUST_DOMAIN }
