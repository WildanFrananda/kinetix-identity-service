import IdentityGrpcController from "../src/adapters/controllers/identity_grpc.controller"
import MerchantEntity from "../src/domain/entities/merchant.entity"
import MerchantChange from "../src/domain/entities/merchant_change.entity"
import MerchantChangePage from "../src/domain/entities/merchant_change_page.entity"
import MerchantRepositoryPort from "../src/domain/ports/merchant_repository.port"
import { MERCHANT_ALIAS_SERVICE } from "../src/application/services/seller_onboarding_usecase.service"
import { fromProtoTimestamp, toProtoTimestamp } from "../src/adapters/mappers/proto_timestamp.mapper"

type Ask = { updatedThrough: Date | null; lastId: number; limit: number }

const NOON = new Date("2026-09-22T12:00:00.000Z")
const LATER = new Date("2026-09-22T12:05:00.000Z")

function merchant(id: number, storeName: string, status: MerchantEntity["status"]): MerchantEntity {
  return new MerchantEntity(id, id + 900, storeName, `store-${id}`, `brn-${id}`, `tax-${id}`, status)
}

class FakeMerchantRepository implements MerchantRepositoryPort {
  asks: Ask[] = []
  page = new MerchantChangePage([], false)

  async findById(): Promise<MerchantEntity | null> {
    return null
  }

  async findByUserId(): Promise<MerchantEntity | null> {
    return null
  }

  async findBySlug(): Promise<MerchantEntity | null> {
    return null
  }

  async findChangedSince(
    updatedThrough: Date | null,
    lastId: number,
    limit: number
  ): Promise<MerchantChangePage> {
    this.asks.push({ updatedThrough, lastId, limit })

    return this.page
  }

  async save(merchant: MerchantEntity): Promise<MerchantEntity> {
    return merchant
  }
}

type AliasRow = { principalId: string; service: string; localId: string }

function aliasRepositoryOf(rows: AliasRow[]) {
  return {
    async findOne({ where }: { where: { principalId: string; service: string } }) {
      return (
        rows.find(
          (row) => row.principalId === where.principalId && row.service === where.service
        ) ?? null
      )
    },
    async find({ where }: { where: { service: string; localId: { value: string[] } } }) {
      const wanted = where.localId.value

      return rows.filter((row) => row.service === where.service && wanted.includes(row.localId))
    }
  }
}

function controllerWith(repository: MerchantRepositoryPort, rows: AliasRow[]) {
  const unused = null as never

  return new IdentityGrpcController(
    unused,
    unused,
    repository,
    unused,
    aliasRepositoryOf(rows) as never,
    unused
  )
}

describe("the merchant change feed", () => {
  it("caps a page a caller asks to be enormous", async () => {
    const repository = new FakeMerchantRepository()
    const controller = controllerWith(repository, [])

    await controller.merchantsChangedSince({ limit: 1_000_000 })

    expect(repository.asks[0].limit).toBe(500)
  })

  it("reads a whole page when the caller names no size", async () => {
    const repository = new FakeMerchantRepository()
    const controller = controllerWith(repository, [])

    await controller.merchantsChangedSince({})

    expect(repository.asks[0].limit).toBe(100)
  })

  it("translates the cursor's principal back into the row the walk stopped at", async () => {
    const repository = new FakeMerchantRepository()
    const controller = controllerWith(repository, [
      { principalId: "p-7", service: MERCHANT_ALIAS_SERVICE, localId: "7" }
    ])

    await controller.merchantsChangedSince({
      cursor: { updated_through: toProtoTimestamp(NOON), last_principal_id: "p-7" }
    })

    expect(repository.asks[0].lastId).toBe(7)
    expect(repository.asks[0].updatedThrough).toEqual(NOON)
  })

  it("re-reads the tie rather than skipping them when the cursor's principal is unknown", async () => {
    const repository = new FakeMerchantRepository()
    const controller = controllerWith(repository, [])

    await controller.merchantsChangedSince({
      cursor: { updated_through: toProtoTimestamp(NOON), last_principal_id: "p-gone" }
    })

    expect(repository.asks[0].lastId).toBe(0)
    expect(repository.asks[0].updatedThrough).toEqual(NOON)
  })

  it("starts at the beginning when there is no cursor at all", async () => {
    const repository = new FakeMerchantRepository()
    const controller = controllerWith(repository, [])

    await controller.merchantsChangedSince({})

    expect(repository.asks[0].updatedThrough).toBeNull()
    expect(repository.asks[0].lastId).toBe(0)
  })

  it("reports each changed merchant against its principal, never its local id", async () => {
    const repository = new FakeMerchantRepository()
    repository.page = new MerchantChangePage(
      [new MerchantChange(merchant(4, "Toko Sepatu", "verified"), NOON)],
      false
    )
    const controller = controllerWith(repository, [
      { principalId: "p-4", service: MERCHANT_ALIAS_SERVICE, localId: "4" }
    ])

    const response = await controller.merchantsChangedSince({})

    expect(response.upserted).toHaveLength(1)
    expect(response.upserted[0].principal_id).toBe("p-4")
    expect(response.upserted[0].store_name).toBe("Toko Sepatu")
    expect(response.upserted[0].status).toBe("MERCHANT_STATUS_VERIFIED")
    expect(response.upserted[0].may_sell).toBe(true)
    expect(fromProtoTimestamp(response.upserted[0].updated_at)).toEqual(NOON)
  })

  it("still reports a merchant that may not sell, because leaving it out is not a deletion", async () => {
    const repository = new FakeMerchantRepository()
    repository.page = new MerchantChangePage(
      [new MerchantChange(merchant(5, "Toko Tutup", "suspended"), NOON)],
      false
    )
    const controller = controllerWith(repository, [
      { principalId: "p-5", service: MERCHANT_ALIAS_SERVICE, localId: "5" }
    ])

    const response = await controller.merchantsChangedSince({})

    expect(response.upserted).toHaveLength(1)
    expect(response.upserted[0].may_sell).toBe(false)
    expect(response.upserted[0].status).toBe("MERCHANT_STATUS_SUSPENDED")
    expect(response.removed_principal_ids).toEqual([])
  })

  it("fails rather than answering a page with a merchant it cannot name", async () => {
    const repository = new FakeMerchantRepository()
    repository.page = new MerchantChangePage(
      [new MerchantChange(merchant(6, "Toko Tanpa Principal", "verified"), NOON)],
      false
    )
    const controller = controllerWith(repository, [])

    await expect(controller.merchantsChangedSince({})).rejects.toThrow(/no .* alias/)
  })

  it("hands back a cursor built from the last row of the page", async () => {
    const repository = new FakeMerchantRepository()
    repository.page = new MerchantChangePage(
      [
        new MerchantChange(merchant(1, "Satu", "verified"), NOON),
        new MerchantChange(merchant(2, "Dua", "verified"), LATER)
      ],
      true
    )
    const controller = controllerWith(repository, [
      { principalId: "p-1", service: MERCHANT_ALIAS_SERVICE, localId: "1" },
      { principalId: "p-2", service: MERCHANT_ALIAS_SERVICE, localId: "2" }
    ])

    const response = await controller.merchantsChangedSince({})

    expect(response.has_more).toBe(true)
    expect(response.next.last_principal_id).toBe("p-2")
    expect(fromProtoTimestamp(response.next.updated_through)).toEqual(LATER)
  })

  it("keeps the caller's cursor when nothing changed, rather than sending it back to the start", async () => {
    const repository = new FakeMerchantRepository()
    const controller = controllerWith(repository, [
      { principalId: "p-9", service: MERCHANT_ALIAS_SERVICE, localId: "9" }
    ])

    const response = await controller.merchantsChangedSince({
      cursor: { updated_through: toProtoTimestamp(NOON), last_principal_id: "p-9" }
    })

    expect(response.upserted).toEqual([])
    expect(response.has_more).toBe(false)
    expect(response.next.last_principal_id).toBe("p-9")
    expect(fromProtoTimestamp(response.next.updated_through)).toEqual(NOON)
  })
})

describe("a protobuf timestamp", () => {
  it("survives the round trip", () => {
    const at = new Date("2026-09-22T12:34:56.789Z")

    expect(fromProtoTimestamp(toProtoTimestamp(at))).toEqual(at)
  })

  it("reads seconds that arrive as a string or a long, the way the loader sends them", () => {
    expect(fromProtoTimestamp({ seconds: "1790000000", nanos: 0 })?.getTime()).toBe(
      1790000000 * 1000
    )
    expect(
      fromProtoTimestamp({ seconds: { toString: () => "1790000000" }, nanos: 0 })?.getTime()
    ).toBe(1790000000 * 1000)
  })

  it("reads an absent timestamp as absent, not as the epoch", () => {
    expect(fromProtoTimestamp(null)).toBeNull()
    expect(fromProtoTimestamp(undefined)).toBeNull()
    expect(fromProtoTimestamp({})).toBeNull()
  })
})
