import { serviceOf, trustDomain, trustDomains, TRUST_DOMAIN, TRUST_PREFIXES } from "../src/infrastructure/mesh/spiffe"

describe("the trust domain this service accepts", () => {
  it("keeps the domain the estate runs today when the variable is unset", () => {
    expect(trustDomain).toBe("kinetix.local")
    expect(trustDomains).toEqual(["kinetix.local"])
    expect(TRUST_DOMAIN).toBe("spiffe://kinetix.local/service/")
    expect(TRUST_PREFIXES).toEqual(["spiffe://kinetix.local/service/"])
  })

  it("can accept both domains at once, which is what makes a cutover gradual", () => {
    const both = ["spiffe://kinetix.local/service/", "spiffe://prod.kinetix/service/"]

    for (const domain of ["kinetix.local", "prod.kinetix"]) {
      const id = `spiffe://${domain}/service/order`
      const named = both.map((prefix) => serviceOf(id, prefix)).find((n) => n !== null)
      expect(named).toBe("order")
    }
  })

  it("still refuses a domain outside the list", () => {
    const both = ["spiffe://kinetix.local/service/", "spiffe://prod.kinetix/service/"]
    const named = both.map((prefix) => serviceOf("spiffe://staging.kinetix/service/order", prefix))
    expect(named.every((n) => n === null)).toBe(true)
  })

  it("names the service in an id from the configured domain", () => {
    expect(serviceOf("spiffe://kinetix.local/service/order", "spiffe://kinetix.local/service/")).toBe("order")
  })

  it("can be pointed at another domain without touching this code", () => {
    expect(serviceOf("spiffe://prod.kinetix/service/order", "spiffe://prod.kinetix/service/")).toBe("order")
  })

  it("names nobody for an id from another trust domain", () => {
    expect(serviceOf("spiffe://prod.kinetix/service/order", "spiffe://kinetix.local/service/")).toBeNull()
    expect(serviceOf("spiffe://kinetix.local/service/order", "spiffe://prod.kinetix/service/")).toBeNull()
  })

  it("refuses a domain this one is merely a prefix of", () => {
    expect(
      serviceOf("spiffe://kinetix.local.example.com/service/order", "spiffe://kinetix.local/service/")
    ).toBeNull()
  })

  it("refuses an id that names no service, or names a path", () => {
    expect(serviceOf("spiffe://kinetix.local/service/", "spiffe://kinetix.local/service/")).toBeNull()
    expect(serviceOf("spiffe://kinetix.local/service/a/b", "spiffe://kinetix.local/service/")).toBeNull()
  })
})
