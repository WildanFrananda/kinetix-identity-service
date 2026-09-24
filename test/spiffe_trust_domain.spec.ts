import { serviceOf, trustDomain, TRUST_DOMAIN } from "../src/infrastructure/mesh/spiffe"

describe("the trust domain this service accepts", () => {
  it("keeps the domain the estate runs today when the variable is unset", () => {
    expect(trustDomain).toBe("kinetix.local")
    expect(TRUST_DOMAIN).toBe("spiffe://kinetix.local/service/")
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
