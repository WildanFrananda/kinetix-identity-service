import IdentityGrpcController from "../src/adapters/controllers/identity_grpc.controller"
import MerchantEntity from "../src/domain/entities/merchant.entity"
import { MERCHANT_ALIAS_SERVICE } from "../src/application/services/seller_onboarding_usecase.service"

function controllerWith(overrides: {
  merchant?: MerchantEntity | null
  profile?: { latitude?: number; longitude?: number } | null
}) {
  const unused = null as never

  const merchantRepository = {
    findById: async () => overrides.merchant ?? null,
    findByUserId: async () => null,
    findBySlug: async () => null,
    findChangedSince: async () => ({ changes: [], hasMore: false }),
    save: async (m: MerchantEntity) => m
  }

  const aliasRepository = {
    findOne: async () => ({
      principalId: "p-1",
      service: MERCHANT_ALIAS_SERVICE,
      localId: "1",
      principal: { kind: "merchant", displayName: "Toko" }
    }),
    find: async () => []
  }

  return new IdentityGrpcController(
    unused,
    unused,
    merchantRepository as never,
    unused,
    aliasRepository as never,
    unused
  )
}

function merchant(latitude?: number, longitude?: number): MerchantEntity {
  return new MerchantEntity(
    1,
    9,
    "Toko Sepatu",
    "toko-sepatu",
    "brn",
    "tax",
    "verified",
    undefined,
    undefined,
    "Jl. Sudirman",
    "Jakarta",
    "10110",
    latitude,
    longitude
  )
}

describe("a location that was never geocoded", () => {
  it("is absent from the merchant answer, not a point in the ocean", async () => {
    const controller = controllerWith({ merchant: merchant(undefined, undefined) })

    const response = await controller.getMerchantInfo({ principal_id: "p-1" })

    expect(response.found).toBe(true)
    expect(response.location).toBeUndefined()
  })

  it("is present when the address really was placed", async () => {
    const controller = controllerWith({ merchant: merchant(-6.1754, 106.8272) })

    const response = await controller.getMerchantInfo({ principal_id: "p-1" })

    expect(response.location).toEqual({ latitude: -6.1754, longitude: 106.8272 })
  })

  it("is absent from the empty answer a failure returns", async () => {
    const controller = controllerWith({ merchant: null })

    const response = await controller.getMerchantInfo({ principal_id: "p-1" })

    expect(response.found).toBe(false)
    expect(response.location).toBeUndefined()
  })
})
