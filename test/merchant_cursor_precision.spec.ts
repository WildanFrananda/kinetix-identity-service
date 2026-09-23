import { DataSource } from "typeorm"
import MerchantEntity from "../src/domain/entities/merchant.entity"
import MerchantTypeormEntity from "../src/infrastructure/persistence/entities/merchant_typeorm.entity"
import UserTypeormEntity from "../src/infrastructure/persistence/entities/user_typeorm.entity"
import TypeormMerchantRepositoryAdapter from "../src/infrastructure/persistence/adapters/typeorm_merchant_repository.adapter"

const connectionString = process.env.KINETIX_TEST_POSTGRES

const describeWithDatabase = connectionString ? describe : describe.skip

describeWithDatabase("the merchant change feed's cursor", () => {
  let dataSource: DataSource
  let merchants: TypeormMerchantRepositoryAdapter

  beforeAll(async () => {
    dataSource = (await import("../src/data-source")).default
    await dataSource.initialize()
    await dataSource.runMigrations()

    merchants = new TypeormMerchantRepositoryAdapter(
      dataSource.getRepository(MerchantTypeormEntity)
    )
  }, 60000)

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy()
    }
  })

  beforeEach(async () => {
    await dataSource.query(`DELETE FROM "merchants"`)
    await dataSource.query(`DELETE FROM "users"`)
  })

  async function aMerchant(storeName: string): Promise<MerchantEntity> {
    const user = await dataSource.getRepository(UserTypeormEntity).save(
      dataSource.getRepository(UserTypeormEntity).create({
        email: `${storeName}@example.test`,
        passwordHash: "not-a-real-hash"
      })
    )

    return merchants.save(
      new MerchantEntity(0, user.id, storeName, storeName, "brn", "tax", "verified")
    )
  }

  it("does not hand back a cursor that reads the same merchant for ever", async () => {
    await aMerchant("toko-sepatu")

    const first = await merchants.findChangedSince(null, 0, 10)
    expect(first.changes).toHaveLength(1)

    const last = first.changes[0]
    const second = await merchants.findChangedSince(last.updatedAt, last.merchant.id, 10)

    expect(second.changes).toEqual([])
  })

  it("stores the timestamp at the precision the wire can carry", async () => {
    await aMerchant("toko-tas")

    const page = await merchants.findChangedSince(null, 0, 10)
    const stored = page.changes[0].updatedAt

    expect(stored.getTime() % 1).toBe(0)
    expect(stored).toEqual(new Date(stored.getTime()))
  })

  it("still walks past a merchant that really is older", async () => {
    await aMerchant("toko-satu")
    await new Promise((resolve) => setTimeout(resolve, 5))
    await aMerchant("toko-dua")

    const first = await merchants.findChangedSince(null, 0, 1)
    expect(first.changes).toHaveLength(1)
    expect(first.hasMore).toBe(true)

    const last = first.changes[0]
    const second = await merchants.findChangedSince(last.updatedAt, last.merchant.id, 10)

    expect(second.changes).toHaveLength(1)
    expect(second.changes[0].merchant.storeName).not.toBe(last.merchant.storeName)
  })
})
