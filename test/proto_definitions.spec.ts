import { loadSync } from "@grpc/proto-loader"
import { contractProto, contractProtoRoot } from "../src/infrastructure/mesh/contract_proto"

const LOADER = {
  keepCase: true,
  includeDirs: [contractProtoRoot()]
}

describe("the contracts this service serves", () => {
  it("loads identity.v1 and geo.v1 together, the way the server does", () => {
    const definition = loadSync(
      [contractProto("identity/v1/identity.proto"), contractProto("geo/v1/geo.proto")],
      LOADER
    )

    expect(definition["identity.v1.IdentityService"]).toBeDefined()
    expect(definition["geo.v1.GeocodingService"]).toBeDefined()
  })

  it("resolves an import from the contract root, not from the importing file", () => {
    const definition = loadSync(contractProto("identity/v1/identity.proto"), LOADER)

    expect(definition["common.v1.GeoPoint"]).toBeDefined()
  })

  it("fails without includeDirs, which is why they are passed", () => {
    expect(() =>
      loadSync(contractProto("identity/v1/identity.proto"), { keepCase: true })
    ).toThrow()
  })

  it("serves every method the server declares a handler for", () => {
    const definition = loadSync(
      [contractProto("identity/v1/identity.proto"), contractProto("geo/v1/geo.proto")],
      LOADER
    )

    const identity = definition["identity.v1.IdentityService"] as Record<string, unknown>
    const geo = definition["geo.v1.GeocodingService"] as Record<string, unknown>

    for (const method of [
      "ResolvePrincipal",
      "GetPrincipal",
      "GetUserProfile",
      "GetMerchantInfo",
      "ValidateToken"
    ]) {
      expect(identity[method]).toBeDefined()
    }

    for (const method of ["GeocodeAddress", "GeocodeAddresses"]) {
      expect(geo[method]).toBeDefined()
    }
  })

  it("carries may_sell on the merchant answer, which is what this service decides", () => {
    const definition = loadSync(contractProto("identity/v1/identity.proto"), LOADER)
    const response = definition["identity.v1.GetMerchantInfoResponse"] as {
      type: { field: Array<{ name: string; type: string }> }
    }

    const maySell = response.type.field.find((field) => field.name === "may_sell")

    expect(maySell).toBeDefined()
    expect(maySell?.type).toBe("TYPE_BOOL")
  })
})
