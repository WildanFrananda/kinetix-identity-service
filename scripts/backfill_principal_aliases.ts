/**
 * Backfills principals and principal_aliases from every service database, and reports what it
 * could not place.
 *
 * The bridge this relies on is the defect it is unwinding. Every service stored identity's
 * `users.id` as its own `customer_id`, `merchant_id` or `driver_id` — that is why a service
 * could ever "know" a user at all, and why the platform has no other mapping to work from. So
 * a referenced id is resolved by treating it as an identity user id, and anything that does not
 * match is reported rather than guessed at.
 *
 * Idempotent by construction: a principal is minted only when the identity alias is absent, and
 * every alias insert is ON CONFLICT DO NOTHING against the (service, local_id) unique key. Run
 * it twice and the second run changes nothing.
 *
 * The orphan report is not a diagnostic afterthought. S9's P3-IDM-03 and S11's escrow routing
 * both need to know which rows point at a principal that does not exist, because those are the
 * rows that cannot be migrated automatically and need a decision.
 *
 *   bun run scripts/backfill_principal_aliases.ts            # report only, writes nothing
 *   bun run scripts/backfill_principal_aliases.ts --apply    # writes
 */

import { Client } from "pg"

type Kind = "PRINCIPAL_KIND_CUSTOMER" | "PRINCIPAL_KIND_MERCHANT" | "PRINCIPAL_KIND_DRIVER" | "PRINCIPAL_KIND_STAFF"

interface Source {
  service: string
  table: string
  column: string
  kind: Kind
}

/**
 * Every column in another service's database that holds an identity id.
 *
 * Django's own auth tables are excluded on purpose: `auth_user_groups.user_id` and
 * `django_admin_log.user_id` point at catalog's own `auth_user`, not at identity, and treating
 * them as identity ids would mint principals for Django admin accounts.
 */
const SOURCES: Source[] = [
  { service: "order", table: "orders", column: "customer_id", kind: "PRINCIPAL_KIND_CUSTOMER" },
  { service: "warehouse", table: "orders", column: "merchant_id", kind: "PRINCIPAL_KIND_MERCHANT" },
  { service: "warehouse", table: "returns", column: "merchant_id", kind: "PRINCIPAL_KIND_MERCHANT" },
  { service: "warehouse", table: "staff_users", column: "merchant_id", kind: "PRINCIPAL_KIND_MERCHANT" },
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
  // No default host, user or password: a backfill that silently connects somewhere unintended
  // writes principals into a database nobody asked it to touch.
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

  // ── Phase 1: a principal per identity user ────────────────────────────────────────────────
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
    const kind = user.role === "merchant" ? "PRINCIPAL_KIND_MERCHANT" : "PRINCIPAL_KIND_CUSTOMER"
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

  // The mapping every other service is resolved through.
  //
  // In report mode the identity aliases have not been written, so this is seeded from the users
  // that WOULD be minted. Without that, a dry run reports every referenced id as an orphan and
  // an --apply run resolves most of them — a report that disagrees with the thing it is
  // reporting on is worse than no report, because it is the one people act on.
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

  // ── Phase 2: an alias per referenced id, and an orphan for every one that does not resolve ─
  const orphans: { service: string; table: string; column: string; localId: string; kind: Kind }[] = []
  // An alias resolved, but the source says this id is a merchant and the principal is a
  // customer. Not an orphan and not clean: the id maps to a real person whose role disagrees
  // with the role the referencing service assumed. Reported separately because the fix is
  // different — an orphan needs a principal created, a mismatch needs someone to decide which
  // side is wrong.
  const mismatches: { service: string; table: string; column: string; localId: string; expected: Kind; actual: string }[] = []
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
        kindByLocalId.set(user.id, user.role === "merchant" ? "PRINCIPAL_KIND_MERCHANT" : "PRINCIPAL_KIND_CUSTOMER")
      }
    }
  }

  const services = [...new Set(SOURCES.map((s) => s.service))]
  for (const service of services) {
    const client = new Client({ connectionString: dsn(service) })
    try {
      await client.connect()
    } catch (error) {
      // Reported, not swallowed. A service that could not be read is not a service with no
      // rows, and a backfill that treats the two the same leaves aliases silently missing.
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
        // DRIVER is not compared: identity has no driver role today, so every driver id would
        // report as a mismatch and drown the ones that mean something.
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

  // ── Phase 3: the orphan report ────────────────────────────────────────────────────────────
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
    console.log(`\nkind mismatches: ${mismatches.length} ids resolved to a principal of a different kind`)
    console.log("the alias is written; the disagreement is not resolved by this script\n")
    for (const m of mismatches) {
      console.log(`  ${m.service}.${m.table}.${m.column} = ${m.localId}  expected ${m.expected}, principal is ${m.actual}`)
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
