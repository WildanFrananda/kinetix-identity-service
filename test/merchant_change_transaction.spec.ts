import { DataSource } from "typeorm"
import MerchantEntity from "../src/domain/entities/merchant.entity"
import MerchantTypeormEntity from "../src/infrastructure/persistence/entities/merchant_typeorm.entity"
import UserTypeormEntity from "../src/infrastructure/persistence/entities/user_typeorm.entity"
import TypeormMerchantRepositoryAdapter from "../src/infrastructure/persistence/adapters/typeorm_merchant_repository.adapter"

const connectionString = process.env.KINETIX_TEST_POSTGRES

const describeWithDatabase = connectionString ? describe : describe.skip

describeWithDatabase("the merchant change feed's transaction cursor", () => {
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

  function renamed(merchant: MerchantEntity, storeName: string): MerchantEntity {
    return new MerchantEntity(
      merchant.id,
      merchant.userId,
      storeName,
      merchant.slug,
      merchant.businessRegistrationNumber,
      merchant.taxId,
      merchant.status
    )
  }

  it("walks every merchant once, in the order they were written", async () => {
    for (const name of ["toko-c", "toko-a", "toko-b"]) {
      await aMerchant(name)
    }

    const seen: string[] = []
    let transactionId = "0"
    let lastId = 0
    for (let pass = 0; pass < 10; pass += 1) {
      const page = await merchants.findChangedAfter(transactionId, lastId, 2)
      seen.push(...page.changes.map((change) => change.merchant.storeName))
      transactionId = page.lastTransactionId ?? transactionId
      lastId = page.changes.at(-1)?.merchant.id ?? lastId
      if (!page.hasMore) {
        break
      }
    }

    expect(seen).toEqual(["toko-c", "toko-a", "toko-b"])
  })

  it("holds back a commit that is still open and serves it, in order, once it lands", async () => {
    const early = await aMerchant("toko-awal")
    const later = await aMerchant("toko-akhir")
    const caughtUp = await merchants.findChangedAfter("0", 0, 10)
    expect(caughtUp.hasMore).toBe(false)

    const cursor = caughtUp.lastTransactionId ?? "0"
    const lastId = caughtUp.changes.at(-1)?.merchant.id ?? 0

    const other = dataSource.createQueryRunner()
    await other.connect()
    await other.startTransaction()

    try {
      await other.query(`UPDATE "merchants" SET "storeName" = $1 WHERE "id" = $2`, [
        "toko-awal-baru",
        early.id
      ])
      await merchants.save(renamed(later, "toko-akhir-baru"))

      const held = await merchants.findChangedAfter(cursor, lastId, 10)

      expect(held.changes).toEqual([])
      expect(held.lastTransactionId).toBe(cursor)

      await other.commitTransaction()
    } finally {
      await other.release()
    }

    const served = await merchants.findChangedAfter(cursor, lastId, 10)

    expect(served.changes.map((change) => change.merchant.storeName)).toEqual([
      "toko-awal-baru",
      "toko-akhir-baru"
    ])
  })

  it("pages one transaction by merchant without losing any", async () => {
    const users = await dataSource.getRepository(UserTypeormEntity).save(
      ["toko-1", "toko-2", "toko-3"].map((name) =>
        dataSource.getRepository(UserTypeormEntity).create({
          email: `${name}@example.test`,
          passwordHash: "not-a-real-hash"
        })
      )
    )
    await dataSource.transaction(async (manager) => {
      const repository = new TypeormMerchantRepositoryAdapter(
        manager.getRepository(MerchantTypeormEntity)
      )
      for (const user of users) {
        await repository.save(
          new MerchantEntity(0, user.id, user.email, user.email, "brn", "tax", "verified")
        )
      }
    })

    const first = await merchants.findChangedAfter("0", 0, 2)
    const second = await merchants.findChangedAfter(
      first.lastTransactionId ?? "0",
      first.changes.at(-1)?.merchant.id ?? 0,
      2
    )

    expect(first.changes).toHaveLength(2)
    expect(first.hasMore).toBe(true)
    expect(second.changes).toHaveLength(1)
    expect(second.lastTransactionId).toBe(first.lastTransactionId)
  })

  it("moves a merchant changed again to the end of the feed", async () => {
    const first = await aMerchant("toko-pertama")
    await aMerchant("toko-kedua")
    await merchants.save(renamed(first, "toko-pertama-baru"))

    const page = await merchants.findChangedAfter("0", 0, 10)

    expect(page.changes.map((change) => change.merchant.storeName)).toEqual([
      "toko-kedua",
      "toko-pertama-baru"
    ])
  })
})
