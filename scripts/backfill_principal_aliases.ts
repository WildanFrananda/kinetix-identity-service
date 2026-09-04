import { Client } from "pg"
import { principalKindForRole } from "../src/domain/principal_kind"
import type { BackfillKindMismatch, BackfillOrphan, BackfillSource } from "./types/backfill.type"
import { UserRole } from "src/types/principal.type"

const SOURCES: BackfillSource[] = [
  { service: "order", table: "orders", column: "customer_id", kind: "PRINCIPAL_KIND_CUSTOMER" },
  { service: "catalog", table: "products", column: "merchant_id", kind: "PRINCIPAL_KIND_MERCHANT" },
  { service: "matching", table: "orders", column: "merchant_id", kind: "PRINCIPAL_KIND_MERCHANT" },
  { service: "matching", table: "orders", column: "driver_id", kind: "PRINCIPAL_KIND_DRIVER" },
  { service: "matching", table: "location_pings", column: "driver_id", kind: "PRINCIPAL_KIND_DRIVER" },
  { service: "payment", table: "escrow_holds", column: "customer_id", kind: "PRINCIPAL_KIND_CUSTOMER" },
  { service: "payment", table: "escrow_holds", column: "merchant_id", kind: "PRINCIPAL_KIND_MERCHANT" },
  { service: "payment", table: "escrow_holds", column: "driver_id", kind: "PRINCIPAL_KIND_DRIVER" },
  { service: "payment", table: "customer_wallets", column: "customer_id", kind: "PRINCIPAL_KIND_CUSTOMER" },
  { service: "payment", table: "merchant_wallets", column: "merchant_id", kind: "PRINCIPAL_KIND_MERCHANT" },
  { service: "payment", table: "driver_wallets", column: "driver_id", kind: "PRINCIPAL_KIND_DRIVER" },
  { service: "payment", table: "payment_transactions", column: "user_id", kind: "PRINCIPAL_KIND_CUSTOMER" },
  { service: "review", table: "product_reviews", column: "customer_id", kind: "PRINCIPAL_KIND_CUSTOMER" },
  { service: "review", table: "product_reviews", column: "merchant_id", kind: "PRINCIPAL_KIND_MERCHANT" },
  { service: "review", table: "driver_ratings", column: "customer_id", kind: "PRINCIPAL_KIND_CUSTOMER" },
  { service: "review", table: "driver_ratings", column: "driver_id", kind: "PRINCIPAL_KIND_DRIVER" }
]

const APPLY = process.argv.includes("--apply")

function dsn(service: string): string {
  const explicit = process.env[`${service.toUpperCase()}_DATABASE_URL`]
  if (explicit) {
    return explicit
  }
  const password = process.env[`${service.toUpperCase()}_DB_PASSWORD`]
  if (!password) {
    throw new Error(`${service.toUpperCase()}_DATABASE_URL or ${service.toUpperCase()}_DB_PASSWORD must be set`)
  }
  const host = process.env[`${service.toUpperCase()}_DB_HOST`] ?? `kinetix-${service}-db`
  const user = process.env[`${service.toUpperCase()}_DB_USERNAME`] ?? `kinetix_${service}_app`
  return `postgres://${user}:${encodeURIComponent(password)}@${host}:5432/kinetix_${service}_dev`
}

async function main(): Promise<void> {
  const identity = new Client({ connectionString: dsn("identity") })
  await identity.connect()

  const users = await identity.query<{ id: string; email: string; role: string }>(
    `SELECT id::text, email, role FROM users ORDER BY id`
  )

  let minted = 0
  for (const user of users.rows) {
    const existing = await identity.query(
      `SELECT "principalId" FROM principal_aliases WHERE service = 'identity' AND "localId" = $1`,
      [user.id]
    )
    if (existing.rowCount && existing.rowCount > 0) {
      continue
    }
    if (!APPLY) {
      minted += 1
      continue
    }
    const kind = principalKindForRole(user.role as UserRole)
    const created = await identity.query<{ id: string }>(
      `INSERT INTO principals (kind, "displayName") VALUES ($1, $2) RETURNING id`,
      [kind, user.email]
    )
    await identity.query(
      `INSERT INTO principal_aliases ("principalId", service, "localId") VALUES ($1, 'identity', $2)
       ON CONFLICT ON CONSTRAINT uq_principal_aliases_service_local_id DO NOTHING`,
      [created.rows[0].id, user.id]
    )
    minted += 1
  }
  console.log(`principals: ${minted} ${APPLY ? "minted" : "would be minted"} from ${users.rowCount} identity users`)

  const byLocalId = new Map<string, string>()
  const aliases = await identity.query<{ localId: string; principalId: string }>(
    `SELECT "localId", "principalId" FROM principal_aliases WHERE service = 'identity'`
  )
  for (const row of aliases.rows) {
    byLocalId.set(row.localId, row.principalId)
  }
  if (!APPLY) {
    for (const user of users.rows) {
      if (!byLocalId.has(user.id)) {
        byLocalId.set(user.id, "(would be minted)")
      }
    }
  }

  const orphans: BackfillOrphan[] = []
  const mismatches: BackfillKindMismatch[] = []
  let linked = 0

  const kindByLocalId = new Map<string, string>()
  const kindRows = await identity.query<{ localId: string; kind: string }>(
    `SELECT a."localId", p.kind FROM principal_aliases a JOIN principals p ON p.id = a."principalId" WHERE a.service = 'identity'`
  )
  for (const row of kindRows.rows) {
    kindByLocalId.set(row.localId, row.kind)
  }
  if (!APPLY) {
    for (const user of users.rows) {
      if (!kindByLocalId.has(user.id)) {
        kindByLocalId.set(user.id, principalKindForRole(user.role as UserRole))
      }
    }
  }

  const services = [...new Set(SOURCES.map((s) => s.service))]
  for (const service of services) {
    const client = new Client({ connectionString: dsn(service) })
    try {
      await client.connect()
    } catch (error) {
      console.error(`${service}: UNREACHABLE — ${(error as Error).message}`)
      continue
    }

    for (const source of SOURCES.filter((s) => s.service === service)) {
      let rows: { value: string }[]
      try {
        const result = await client.query<{ value: string }>(
          `SELECT DISTINCT ${source.column}::text AS value FROM ${source.table} WHERE ${source.column} IS NOT NULL`
        )
        rows = result.rows
      } catch (error) {
        console.error(`${service}.${source.table}.${source.column}: UNREADABLE — ${(error as Error).message}`)
        continue
      }

      for (const row of rows) {
        const principalId = byLocalId.get(row.value)
        if (!principalId) {
          orphans.push({ ...source, localId: row.value })
          continue
        }
        const actualKind = kindByLocalId.get(row.value)
        if (actualKind && source.kind !== "PRINCIPAL_KIND_DRIVER" && actualKind !== source.kind) {
          mismatches.push({ ...source, localId: row.value, expected: source.kind, actual: actualKind })
        }
        if (APPLY) {
          await identity.query(
            `INSERT INTO principal_aliases ("principalId", service, "localId") VALUES ($1, $2, $3)
             ON CONFLICT ON CONSTRAINT uq_principal_aliases_service_local_id DO NOTHING`,
            [principalId, service, row.value]
          )
        }
        linked += 1
      }
    }
    await client.end()
  }

  console.log(`aliases: ${linked} ${APPLY ? "written" : "would be written"}`)

  if (orphans.length === 0) {
    console.log("orphans: none — every referenced id resolved to an identity user")
  } else {
    console.log(`\norphans: ${orphans.length} referenced ids have no identity user`)
    console.log("these rows cannot be migrated automatically; each needs a decision\n")
    for (const orphan of orphans) {
      console.log(`  ${orphan.service}.${orphan.table}.${orphan.column} = ${orphan.localId}  (expected ${orphan.kind})`)
    }
  }

  if (mismatches.length > 0) {
    console.log("the alias is written; the disagreement is not resolved by this script\n")
    for (const m of mismatches) {
    }
  }

  await identity.end()

  if (!APPLY) {
    console.log("\nreport only. re-run with --apply to write.")
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
