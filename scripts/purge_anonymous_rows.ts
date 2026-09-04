import { Client } from "pg"
import { principalKindForRole } from "../src/domain/principal_kind"

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

function dsn(): string {
  const explicit = process.env.IDENTITY_DATABASE_URL
  if (explicit) {
    return explicit
  }
  const password = process.env.IDENTITY_DB_PASSWORD ?? process.env.DB_PASSWORD
  if (!password) {
    throw new Error("IDENTITY_DATABASE_URL or IDENTITY_DB_PASSWORD must be set")
  }
  const host = process.env.IDENTITY_DB_HOST ?? process.env.DB_HOST ?? "kinetix-identity-db"
  const user = process.env.IDENTITY_DB_USERNAME ?? process.env.DB_USERNAME ?? "kinetix_identity_app"
  return `postgres://${user}:${encodeURIComponent(password)}@${host}:5432/kinetix_identity_dev`
}

async function main(): Promise<void> {
  const before = arg("before")
  const apply = process.argv.includes("--apply")

  if (!before || Number.isNaN(Date.parse(before))) {
    console.error("usage: bun scripts/purge_anonymous_rows.ts --before <ISO-8601> [--apply]")
    console.error("  --before is the instant the route guards landed; anything older is untrusted.")
    process.exit(2)
  }

  const client = new Client({ connectionString: dsn() })
  await client.connect()

  try {
    const merchants = await client.query<{ id: number; userId: number; storeName: string }>(
      `SELECT id, "userId", "storeName" FROM merchants WHERE "createdAt" < $1 ORDER BY id`,
      [before]
    )
    const verifications = await client.query<{ id: number; userId: number }>(
      `SELECT id, "userId" FROM merchant_verifications WHERE "verifiedAt" IS NOT NULL AND "verifiedAt" < $1 ORDER BY id`,
      [before]
    )
    const profiles = await client.query<{ id: number; userId: number }>(
      `SELECT id, "userId" FROM profiles WHERE "createdAt" < $1 ORDER BY id`,
      [before]
    )

    console.log(`untrusted rows created before ${before}`)
    console.log(`  merchants               : ${merchants.rowCount}`)
    console.log(`  merchant verifications  : ${verifications.rowCount}`)
    console.log(`  profiles                : ${profiles.rowCount}`)

    for (const m of merchants.rows) {
      console.log(`    merchant ${m.id} "${m.storeName}" (account ${m.userId})`)
    }

    const total = (merchants.rowCount ?? 0) + (verifications.rowCount ?? 0) + (profiles.rowCount ?? 0)
    if (total === 0) {
      console.log("\nnothing to purge.")
      return
    }
    if (!apply) {
      console.log("\ndry run. Nothing was written. Re-run with --apply.")
      return
    }

    await client.query("BEGIN")

    for (const m of merchants.rows) {
      await client.query(`DELETE FROM principal_aliases WHERE service = 'identity-merchant' AND "localId" = $1`, [
        String(m.id)
      ])

      await client.query(`UPDATE users SET role = 'customer', "updatedAt" = now() WHERE id = $1 AND role = 'seller'`, [
        m.userId
      ])
      const alias = await client.query<{ principalId: string }>(
        `SELECT "principalId" FROM principal_aliases WHERE service = 'identity' AND "localId" = $1`,
        [String(m.userId)]
      )
      if (alias.rowCount && alias.rowCount > 0) {
        await client.query(`UPDATE principals SET kind = $1, "updatedAt" = now() WHERE id = $2`, [
          principalKindForRole("customer"),
          alias.rows[0].principalId
        ])
      }
    }

    const delMerchants = await client.query(`DELETE FROM merchants WHERE "createdAt" < $1`, [before])
    const delVerifications = await client.query(
      `DELETE FROM merchant_verifications WHERE "verifiedAt" IS NOT NULL AND "verifiedAt" < $1`,
      [before]
    )
    const delProfiles = await client.query(`DELETE FROM profiles WHERE "createdAt" < $1`, [before])

    await client.query("COMMIT")

    const left = await client.query<{ n: string }>(
      `SELECT (SELECT count(*) FROM merchants WHERE "createdAt" < $1)
            + (SELECT count(*) FROM profiles WHERE "createdAt" < $1) AS n`,
      [before]
    )
    if (left.rows[0].n !== "0") {
      throw new Error(`${left.rows[0].n} untrusted rows survived the purge`)
    }

    console.log(
      `\npurged: ${delMerchants.rowCount} merchants, ${delVerifications.rowCount} verifications, ${delProfiles.rowCount} profiles`
    )
  } catch (cause) {
    await client.query("ROLLBACK").catch(() => undefined)
    throw cause
  } finally {
    await client.end()
  }
}

main().catch((cause) => {
  console.error(String(cause))
  process.exit(1)
})
