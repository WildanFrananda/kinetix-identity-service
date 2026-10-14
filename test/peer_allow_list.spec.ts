import { names, parsePeerAllowList, permits } from "../src/infrastructure/mesh/peer_allow_list"

const ESTATE = [
  "order@identity.v1.IdentityService/ResolvePrincipal",
  "order@identity.v1.IdentityService/GetMerchantInfo",
  "order@identity.v1.IdentityService/GetUserProfile",
  "warehouse@identity.v1.IdentityService/GetMerchantInfo",
  "catalog@identity.v1.IdentityService/GetMerchantInfo",
  "pricing@identity.v1.IdentityService/GetMerchantInfo",
  "notification@identity.v1.IdentityService/GetUserProfile",
  "search@identity.v1.IdentityService/MerchantsChangedSince"
].join(",")

const IDENTITY_METHODS = [
  "ResolvePrincipal",
  "GetPrincipal",
  "GetUserProfile",
  "GetMerchantInfo",
  "ValidateToken",
  "MerchantsChangedSince"
]

const GRANTED: Record<string, string[]> = {
  order: ["ResolvePrincipal", "GetMerchantInfo", "GetUserProfile"],
  warehouse: ["GetMerchantInfo"],
  catalog: ["GetMerchantInfo"],
  pricing: ["GetMerchantInfo"],
  notification: ["GetUserProfile"],
  search: ["MerchantsChangedSince"]
}

describe("identity's allow list, read per RPC", () => {
  it.each(Object.keys(GRANTED))("lets %s reach only the methods it is granted", (peer) => {
    const allowed = parsePeerAllowList(ESTATE)

    for (const method of IDENTITY_METHODS) {
      const reached = permits(allowed, peer, `/identity.v1.IdentityService/${method}`)

      expect({ method, reached }).toEqual({ method, reached: GRANTED[peer].includes(method) })
    }
  })

  it("lets no caller validate a token or geocode an address", () => {
    const allowed = parsePeerAllowList(ESTATE)

    for (const peer of Object.keys(GRANTED)) {
      expect(permits(allowed, peer, "/identity.v1.IdentityService/ValidateToken")).toBe(false)
      expect(permits(allowed, peer, "/geo.v1.GeocodingService/GeocodeAddress")).toBe(false)
    }
  })

  it("reaches nothing for a service off the list, schema included", () => {
    const allowed = parsePeerAllowList(ESTATE)

    expect(names(allowed, "payment")).toBe(false)
    expect(permits(allowed, "payment", "/identity.v1.IdentityService/GetMerchantInfo")).toBe(false)
    expect(
      permits(allowed, "payment", "/grpc.reflection.v1.ServerReflection/ServerReflectionInfo")
    ).toBe(false)
  })

  it("lets a listed caller read the schema, which the mesh probes use", () => {
    const allowed = parsePeerAllowList(ESTATE)

    expect(
      permits(allowed, "search", "/grpc.reflection.v1.ServerReflection/ServerReflectionInfo")
    ).toBe(true)
    expect(
      permits(allowed, "search", "/grpc.reflection.v1alpha.ServerReflection/ServerReflectionInfo")
    ).toBe(true)
  })

  it("reads a bare name as every method, so the old list still parses", () => {
    const allowed = parsePeerAllowList("warehouse,order,catalog,search,notification,pricing")

    for (const method of IDENTITY_METHODS) {
      expect(permits(allowed, "search", `/identity.v1.IdentityService/${method}`)).toBe(true)
    }
  })

  it("reads a service scope as every method of that service and no other", () => {
    const allowed = parsePeerAllowList("order@identity.v1.IdentityService")

    expect(permits(allowed, "order", "/identity.v1.IdentityService/ValidateToken")).toBe(true)
    expect(permits(allowed, "order", "/geo.v1.GeocodingService/GeocodeAddress")).toBe(false)
  })

  it("lets a bare entry win over a scoped one in either order", () => {
    const scopedFirst = parsePeerAllowList("order@identity.v1.IdentityService/GetUserProfile,order")
    const bareFirst = parsePeerAllowList("order,order@identity.v1.IdentityService/GetUserProfile")

    expect(permits(scopedFirst, "order", "/identity.v1.IdentityService/ValidateToken")).toBe(true)
    expect(permits(bareFirst, "order", "/identity.v1.IdentityService/ValidateToken")).toBe(true)
  })

  it.each(["@identity.v1.IdentityService/GetUserProfile", "order@", "order@/"])(
    "refuses '%s' at start-up, which names no peer or no scope",
    (entry) => {
      expect(() => parsePeerAllowList(entry)).toThrow("names no peer or no scope")
    }
  )
})
