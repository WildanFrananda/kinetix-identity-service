import { isIP } from "net"
import { requiredSetting } from "./required_setting"
import type { RelyingParty } from "../../types/relying_party.type"

const DOMAIN_NAME = /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/u

const CEREMONY_SCHEMES: ReadonlySet<string> = new Set(["https:", "http:"])

const ORIGINS = "IDENTITY_WEBAUTHN_ORIGINS"

function relyingPartiesFrom(read: (name: string) => string | undefined): RelyingParty[] {
  const listed = read(ORIGINS)
  if (listed === undefined || listed.trim().length === 0) {
    return [singleRelyingPartyFrom(read)]
  }

  const name = requiredSetting("IDENTITY_WEBAUTHN_RP_NAME", read("IDENTITY_WEBAUTHN_RP_NAME")).trim()
  const parties: RelyingParty[] = []

  for (const [index, entry] of listed.split(",").entries()) {
    const origin = entry.trim()
    const id = listedHostOf(origin, index + 1)
    if (parties.some((party) => party.id === id)) {
      throw new Error(
        `${ORIGINS} entry ${index + 1} is on the host of an earlier entry; each origin's host is its own ` +
          "relying party, so a host is listed once."
      )
    }

    parties.push({ id, origin, name })
  }

  requireAgreement(read, parties[0])

  return parties
}

function requireAgreement(read: (name: string) => string | undefined, first: RelyingParty): void {
  const disagreeing: string[] = []

  const id = read("IDENTITY_WEBAUTHN_RP_ID")
  if (id !== undefined && id.trim().length > 0 && id.trim() !== first.id) {
    disagreeing.push("IDENTITY_WEBAUTHN_RP_ID")
  }

  const origin = read("IDENTITY_WEBAUTHN_ORIGIN")
  if (origin !== undefined && origin.trim().length > 0 && origin.trim() !== first.origin) {
    disagreeing.push("IDENTITY_WEBAUTHN_ORIGIN")
  }

  if (disagreeing.length > 0) {
    throw new Error(
      `${disagreeing.join(" and ")} must agree with the first entry of ${ORIGINS}, which is the configuration ` +
        "when it is set: the single pair is kept beside the list only for a version that reads the pair."
    )
  }
}

function singleRelyingPartyFrom(read: (name: string) => string | undefined): RelyingParty {
  const id = requiredSetting("IDENTITY_WEBAUTHN_RP_ID", read("IDENTITY_WEBAUTHN_RP_ID")).trim()
  const origin = requiredSetting("IDENTITY_WEBAUTHN_ORIGIN", read("IDENTITY_WEBAUTHN_ORIGIN")).trim()
  const name = requiredSetting("IDENTITY_WEBAUTHN_RP_NAME", read("IDENTITY_WEBAUTHN_RP_NAME")).trim()

  if (!isDomainName(id)) {
    throw new Error(
      `IDENTITY_WEBAUTHN_RP_ID is "${id}"; it is a lower-case domain name, never an IP address, which WebAuthn ` +
        "refuses as a relying party."
    )
  }

  const host = originHostOf(origin)
  if (host === null) {
    throw new Error(
      `IDENTITY_WEBAUTHN_ORIGIN is "${origin}"; it is one origin, http(s)://host[:port] in lower case, with ` +
        "nothing after it."
    )
  }

  if (host !== id && !host.endsWith(`.${id}`)) {
    throw new Error(
      `IDENTITY_WEBAUTHN_ORIGIN is "${origin}", whose host is neither IDENTITY_WEBAUTHN_RP_ID ("${id}") nor ` +
        "under it, so no browser would run a ceremony for it."
    )
  }

  return { id, origin, name }
}

function listedHostOf(origin: string, position: number): string {
  if (origin.length === 0) {
    throw new Error(`${ORIGINS} entry ${position} is empty; the list is origins separated by commas.`)
  }

  const host = originHostOf(origin)
  if (host === null) {
    throw new Error(
      `${ORIGINS} entry ${position} is not one origin; each is http(s)://host[:port] in lower case, with nothing ` +
        "after it."
    )
  }

  if (!isDomainName(host)) {
    throw new Error(
      `${ORIGINS} entry ${position} is on a host that is not a lower-case domain name; an IP address is never a ` +
        "relying party, which WebAuthn refuses."
    )
  }

  return host
}

function isDomainName(host: string): boolean {
  return isIP(host) === 0 && DOMAIN_NAME.test(host)
}

function originHostOf(origin: string): string | null {
  let url: URL

  try {
    url = new URL(origin)
  } catch {
    return null
  }

  if (!CEREMONY_SCHEMES.has(url.protocol) || url.origin !== origin) {
    return null
  }

  return url.hostname
}

export { relyingPartiesFrom }
