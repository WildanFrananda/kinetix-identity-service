import { isIP } from "net"
import { requiredSetting } from "./required_setting"
import type { RelyingParty } from "../../types/relying_party.type"

const DOMAIN_NAME = /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/u

const CEREMONY_SCHEMES: ReadonlySet<string> = new Set(["https:", "http:"])

function relyingPartyFrom(read: (name: string) => string | undefined): RelyingParty {
  const id = requiredSetting("IDENTITY_WEBAUTHN_RP_ID", read("IDENTITY_WEBAUTHN_RP_ID")).trim()
  const origin = requiredSetting("IDENTITY_WEBAUTHN_ORIGIN", read("IDENTITY_WEBAUTHN_ORIGIN")).trim()
  const name = requiredSetting("IDENTITY_WEBAUTHN_RP_NAME", read("IDENTITY_WEBAUTHN_RP_NAME")).trim()

  if (isIP(id) !== 0 || !DOMAIN_NAME.test(id)) {
    throw new Error(
      `IDENTITY_WEBAUTHN_RP_ID is "${id}"; it is a lower-case domain name, never an IP address, which WebAuthn ` +
        "refuses as a relying party."
    )
  }

  const host = originHostOf(origin)
  if (host !== id && !host.endsWith(`.${id}`)) {
    throw new Error(
      `IDENTITY_WEBAUTHN_ORIGIN is "${origin}", whose host is neither IDENTITY_WEBAUTHN_RP_ID ("${id}") nor ` +
        "under it, so no browser would run a ceremony for it."
    )
  }

  return { id, origin, name }
}

function originHostOf(origin: string): string {
  let url: URL

  try {
    url = new URL(origin)
  } catch {
    throw new Error(`IDENTITY_WEBAUTHN_ORIGIN is "${origin}", which is not a URL.`)
  }

  if (!CEREMONY_SCHEMES.has(url.protocol) || url.origin !== origin) {
    throw new Error(
      `IDENTITY_WEBAUTHN_ORIGIN is "${origin}"; it is one origin, http(s)://host[:port] in lower case, with ` +
        "nothing after it."
    )
  }

  return url.hostname
}

export { relyingPartyFrom }
