import type { PeerAuthContext } from "../../types/mesh.type"

const DEFAULT_TRUST_DOMAIN = "kinetix.local"

const trustDomains: string[] = (() => {
  const configured = (process.env.KINETIX_TRUST_DOMAIN ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0)

  return configured.length > 0 ? configured : [DEFAULT_TRUST_DOMAIN]
})()

const trustDomain = trustDomains[0]

const TRUST_DOMAIN = `spiffe://${trustDomain}/service/`

const TRUST_PREFIXES = trustDomains.map((domain) => `spiffe://${domain}/service/`)

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
    const service = TRUST_PREFIXES.map((prefix) => serviceOf(normalised, prefix)).find(
      (name) => name !== null
    )
    if (service === undefined || service === null) {
      continue
    }
    return service
  }

  return null
}

export { peerService, serviceOf, trustDomain, trustDomains, TRUST_DOMAIN, TRUST_PREFIXES }
