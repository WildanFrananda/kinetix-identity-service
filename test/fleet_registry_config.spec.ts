import FleetRegistryGrpcAdapter from "../src/infrastructure/mesh/fleet_registry_grpc.adapter"

function configWith(settings: Record<string, string | undefined>): any {
  return { get: (name: string) => settings[name] }
}

describe("the fleet's address", () => {
  it.each([undefined, "", "   "])("refuses to build the fleet client when MATCHING_GRPC_HOST is %p", (host) => {
    expect(() => new FleetRegistryGrpcAdapter(configWith({ MATCHING_GRPC_HOST: host }))).toThrow(
      /MATCHING_GRPC_HOST is required/
    )
  })

  it("builds it when the address is set, without dialling yet", () => {
    expect(
      () => new FleetRegistryGrpcAdapter(configWith({ MATCHING_GRPC_HOST: "kinetix-matching-service:50053" }))
    ).not.toThrow()
  })
})
