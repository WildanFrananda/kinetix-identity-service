import RelyingParties from "../src/domain/relying_parties"
import { relyingPartiesFrom } from "../src/infrastructure/config/relying_party"
import { relyingPartiesProvidedBy } from "../src/infrastructure/webauthn/relying_parties.provider"
import type { RelyingParty } from "../src/types/relying_party.type"

const ONION_HOST = "kinetixbackofficeexampleonionaddressabcdefghijklmnopqrstu.onion"

const LAB: Readonly<Record<string, string>> = {
  IDENTITY_WEBAUTHN_RP_ID: "backoffice.localhost",
  IDENTITY_WEBAUTHN_ORIGIN: "https://backoffice.localhost:8443",
  IDENTITY_WEBAUTHN_RP_NAME: "Kinetix Backoffice"
}

const FACES: Readonly<Record<string, string>> = {
  IDENTITY_WEBAUTHN_ORIGINS: `https://${ONION_HOST},https://backoffice.kinetix.internal`,
  IDENTITY_WEBAUTHN_RP_NAME: "Kinetix Backoffice"
}

function configWith(settings: Record<string, string | undefined>): any {
  return { get: (name: string) => settings[name] }
}

function relyingPartiesOf(settings: Readonly<Record<string, string | undefined>>): RelyingParty[] {
  return relyingPartiesFrom(function (name: string): string | undefined {
    return settings[name]
  })
}

function relyingPartyOf(settings: Readonly<Record<string, string | undefined>>): RelyingParty {
  const parties = relyingPartiesOf(settings)
  expect(parties).toHaveLength(1)

  return parties[0]
}

function listing(origins: string): Record<string, string> {
  return { ...FACES, IDENTITY_WEBAUTHN_ORIGINS: origins }
}

describe("the passkeys' relying party, read at start from the single pair", () => {
  it("reads the lab's settings", () => {
    expect(relyingPartyOf(LAB)).toEqual({
      id: "backoffice.localhost",
      origin: "https://backoffice.localhost:8443",
      name: "Kinetix Backoffice"
    })
  })

  it("reads the onion host over plain http, as Tor Browser serves it", () => {
    const relyingParty = relyingPartyOf({
      ...LAB,
      IDENTITY_WEBAUTHN_RP_ID: ONION_HOST,
      IDENTITY_WEBAUTHN_ORIGIN: `http://${ONION_HOST}`
    })

    expect(relyingParty.id).toBe(ONION_HOST)
    expect(relyingParty.origin).toBe(`http://${ONION_HOST}`)
  })

  it("accepts an origin on a host under the relying party", () => {
    const relyingParty = relyingPartyOf({ ...LAB, IDENTITY_WEBAUTHN_ORIGIN: "https://staff.backoffice.localhost" })

    expect(relyingParty.origin).toBe("https://staff.backoffice.localhost")
  })

  it("is read when the list is set but blank", () => {
    expect(relyingPartyOf({ ...LAB, IDENTITY_WEBAUTHN_ORIGINS: "  " }).id).toBe("backoffice.localhost")
  })

  it.each(["IDENTITY_WEBAUTHN_RP_ID", "IDENTITY_WEBAUTHN_ORIGIN", "IDENTITY_WEBAUTHN_RP_NAME"])(
    "refuses to start without %s",
    (name) => {
      expect(() => relyingPartyOf({ ...LAB, [name]: undefined })).toThrow(`${name} is required`)
      expect(() => relyingPartyOf({ ...LAB, [name]: "  " })).toThrow(`${name} is required`)
    }
  )

  it.each(["10.8.0.1", "::1", "Backoffice.Localhost", "backoffice_localhost", "-backoffice.localhost"])(
    "refuses the relying party %p, which is not a lower-case domain name",
    (id) => {
      expect(() => relyingPartyOf({ ...LAB, IDENTITY_WEBAUTHN_RP_ID: id })).toThrow(/IDENTITY_WEBAUTHN_RP_ID is/)
    }
  )

  it.each([
    "https://backoffice.example",
    "https://notbackoffice.localhost:8443",
    "https://localhost:8443"
  ])("refuses the origin %p, whose host is not the relying party's", (origin) => {
    expect(() => relyingPartyOf({ ...LAB, IDENTITY_WEBAUTHN_ORIGIN: origin })).toThrow(
      /neither IDENTITY_WEBAUTHN_RP_ID/
    )
  })

  it.each([
    "backoffice.localhost:8443",
    "https://backoffice.localhost:8443/",
    "https://backoffice.localhost:8443/login",
    "ftp://backoffice.localhost",
    "https://BACKOFFICE.localhost:8443"
  ])("refuses the origin %p, which is not one lower-case http(s) origin", (origin) => {
    expect(() => relyingPartyOf({ ...LAB, IDENTITY_WEBAUTHN_ORIGIN: origin })).toThrow(/IDENTITY_WEBAUTHN_ORIGIN is/)
  })
})

describe("the passkeys' relying parties, read at start from the list of origins", () => {
  it("makes each origin's host its relying party, in the order given", () => {
    expect(relyingPartiesOf(FACES)).toEqual([
      { id: ONION_HOST, origin: `https://${ONION_HOST}`, name: "Kinetix Backoffice" },
      { id: "backoffice.kinetix.internal", origin: "https://backoffice.kinetix.internal", name: "Kinetix Backoffice" }
    ])
  })

  it("keeps an origin's port, which is not part of its relying party, and trims each entry", () => {
    const parties = relyingPartiesOf(listing(` https://backoffice.localhost:8443 , http://${ONION_HOST} `))

    expect(parties.map((party) => [party.id, party.origin])).toEqual([
      ["backoffice.localhost", "https://backoffice.localhost:8443"],
      [ONION_HOST, `http://${ONION_HOST}`]
    ])
  })

  it("takes one origin", () => {
    expect(relyingPartiesOf(listing("https://backoffice.localhost:8443"))).toHaveLength(1)
  })

  it.each([
    ["an empty entry", "https://backoffice.localhost:8443,,https://backoffice.kinetix.internal", 2],
    ["a trailing comma", "https://backoffice.localhost:8443,", 2],
    ["a host alone", "https://backoffice.localhost:8443,backoffice.kinetix.internal", 2],
    ["a path", "https://backoffice.kinetix.internal/", 1],
    ["capitals", "https://Backoffice.Kinetix.Internal", 1],
    ["another scheme", "wss://backoffice.kinetix.internal", 1],
    ["an IPv4 address", `https://${ONION_HOST},https://10.8.0.1`, 2],
    ["an IPv6 address", "https://[::1]:8443", 1],
    ["a host named twice", "https://backoffice.localhost:8443,https://backoffice.localhost:9443", 2],
    ["an origin named twice", "https://backoffice.localhost:8443,https://backoffice.localhost:8443", 2]
  ])("refuses %s, naming the entry by its position and never by its value", (_label, origins, position) => {
    let refusal: unknown = null

    try {
      relyingPartiesOf(listing(origins))
    } catch (error: unknown) {
      refusal = error
    }

    expect(refusal).toBeInstanceOf(Error)
    expect(String(refusal)).toContain(`IDENTITY_WEBAUTHN_ORIGINS entry ${position} `)
    expect(String(refusal)).not.toContain("backoffice.")
    expect(String(refusal)).not.toContain(ONION_HOST)
  })

  it("reads the list alone", () => {
    expect(relyingPartiesOf(FACES).map((party) => party.id)).toEqual([ONION_HOST, "backoffice.kinetix.internal"])
  })

  it("uses the list when the single pair beside it names the list's first entry, as an older version reads it", () => {
    const parties = relyingPartiesOf({
      ...FACES,
      IDENTITY_WEBAUTHN_RP_ID: ` ${ONION_HOST} `,
      IDENTITY_WEBAUTHN_ORIGIN: `https://${ONION_HOST}`
    })

    expect(parties).toEqual(relyingPartiesOf(FACES))
  })

  it("takes half of the pair beside the list when that half agrees", () => {
    const originOnly = { ...FACES, IDENTITY_WEBAUTHN_ORIGIN: `https://${ONION_HOST}`, IDENTITY_WEBAUTHN_RP_ID: "  " }

    expect(relyingPartiesOf({ ...FACES, IDENTITY_WEBAUTHN_RP_ID: ONION_HOST })).toHaveLength(2)
    expect(relyingPartiesOf(originOnly)).toHaveLength(2)
  })

  it.each([
    [
      "a relying party that is the second entry's",
      { IDENTITY_WEBAUTHN_RP_ID: "backoffice.kinetix.internal", IDENTITY_WEBAUTHN_ORIGIN: `https://${ONION_HOST}` },
      ["IDENTITY_WEBAUTHN_RP_ID"]
    ],
    [
      "an origin over another scheme",
      { IDENTITY_WEBAUTHN_RP_ID: ONION_HOST, IDENTITY_WEBAUTHN_ORIGIN: `http://${ONION_HOST}` },
      ["IDENTITY_WEBAUTHN_ORIGIN"]
    ],
    [
      "an origin on a host under the first entry's",
      { IDENTITY_WEBAUTHN_RP_ID: ONION_HOST, IDENTITY_WEBAUTHN_ORIGIN: `https://staff.${ONION_HOST}` },
      ["IDENTITY_WEBAUTHN_ORIGIN"]
    ],
    [
      "a pair that is the second entry",
      {
        IDENTITY_WEBAUTHN_RP_ID: "backoffice.kinetix.internal",
        IDENTITY_WEBAUTHN_ORIGIN: "https://backoffice.kinetix.internal"
      },
      ["IDENTITY_WEBAUTHN_RP_ID", "IDENTITY_WEBAUTHN_ORIGIN"]
    ],
    [
      "an origin alone that disagrees",
      { IDENTITY_WEBAUTHN_ORIGIN: "https://backoffice.localhost:8443" },
      ["IDENTITY_WEBAUTHN_ORIGIN"]
    ]
  ])("refuses to start with %s beside the list, naming the variables and never a value", (_label, pair, named) => {
    let refusal: unknown = null

    try {
      relyingPartiesOf({ ...FACES, ...pair })
    } catch (error: unknown) {
      refusal = error
    }

    const message = String(refusal)
    expect(refusal).toBeInstanceOf(Error)
    expect(message).toMatch(/^Error: [A-Z_ a-z]+ must agree with the first entry of IDENTITY_WEBAUTHN_ORIGINS, /u)
    expect(message.split(" must agree")[0]).toBe(`Error: ${named.join(" and ")}`)
    expect(message).not.toContain(ONION_HOST)
    expect(message).not.toContain("backoffice.")
    expect(message).not.toContain("https://")
  })

  it("still needs the relying party's name", () => {
    expect(() => relyingPartiesOf({ ...FACES, IDENTITY_WEBAUTHN_RP_NAME: undefined })).toThrow(
      "IDENTITY_WEBAUTHN_RP_NAME is required"
    )
  })
})

describe("the relying party a request faces", () => {
  const parties = new RelyingParties(relyingPartiesOf(FACES))

  it("is the first origin's when the request names no origin, as before there were several", () => {
    expect(parties.first.id).toBe(ONION_HOST)
    expect(parties.facing(null)?.id).toBe(ONION_HOST)
  })

  it("is the one whose origin the request names", () => {
    expect(parties.facing("https://backoffice.kinetix.internal")?.id).toBe("backoffice.kinetix.internal")
    expect(parties.facing(`https://${ONION_HOST}`)?.id).toBe(ONION_HOST)
  })

  it.each([
    "https://backoffice.example",
    `http://${ONION_HOST}`,
    "https://backoffice.kinetix.internal:443",
    "https://BACKOFFICE.kinetix.internal",
    "https://backoffice.kinetix.internal/",
    "",
    `https://${ONION_HOST}, https://backoffice.kinetix.internal`
  ])("is none for %p, which is not a configured origin exactly", (origin) => {
    expect(parties.facing(origin)).toBeNull()
  })

  it("needs at least one relying party", () => {
    expect(() => new RelyingParties([])).toThrow("at least one relying party")
  })

  it("is what the provider builds from the settings, so a missing one stops the service", () => {
    expect(relyingPartiesProvidedBy(configWith(LAB)).first.id).toBe("backoffice.localhost")
    expect(relyingPartiesProvidedBy(configWith(FACES)).first.id).toBe(ONION_HOST)
    expect(() => relyingPartiesProvidedBy(configWith({ ...LAB, IDENTITY_WEBAUTHN_ORIGIN: undefined }))).toThrow(
      "IDENTITY_WEBAUTHN_ORIGIN is required"
    )
  })
})
