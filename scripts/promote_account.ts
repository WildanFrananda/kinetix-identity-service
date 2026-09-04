import { Client } from "pg"
import { principalKindForRole } from "../src/domain/principal_kind"
import type { UserRole } from "../src/types/principal.type"

const ROLES: UserRole[] = ["customer", "seller", "courier", "admin"]

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
  const email = arg("email")
  const role = arg("role") as UserRole | undefined
  const apply = process.argv.includes("--apply")

  if (!email || !role) {
    console.error("usage: bun scripts/promote_account.ts --email <email> --role <role> [--apply]")
    console.error(`roles: ${ROLES.join(", ")}`)
    process.exit(2)
  }
  if (!ROLES.includes(role)) {
    console.error(`unknown role '${role}'. Valid roles: ${ROLES.join(", ")}`)
    process.exit(2)
  }

  const client = new Client({ connectionString: dsn() })
  await client.connect()

  try {
    const found = await client.query<{ id: number; role: string }>(
      `SELECT id, role FROM users WHERE email = $1`,
      [email]
    )
    if (found.rowCount === 0) {
      console.error(`no account with email ${email}`)
      process.exit(1)
    }

    const { id, role: current } = found.rows[0]
    const kind = principalKindForRole(role)

    console.log(`account ${id} (${email}): ${current} -> ${role}`)
    console.log(`principal kind      : ${kind}`)

    if (!apply) {
      console.log("\ndry run. Nothing was written. Re-run with --apply.")
      return
    }

    await client.query("BEGIN")
    await client.query(`UPDATE users SET role = $1, "updatedAt" = now() WHERE id = $2`, [role, id])

    const alias = await client.query<{ principalId: string }>(
      `SELECT "principalId" FROM principal_aliases WHERE service = 'identity' AND "localId" = $1`,
      [String(id)]
    )
    if (alias.rowCount && alias.rowCount > 0) {
      await client.query(`UPDATE principals SET kind = $1, "updatedAt" = now() WHERE id = $2`, [
        kind,
        alias.rows[0].principalId
      ])
      console.log(`principal ${alias.rows[0].principalId} updated`)
    } else {
      console.log("no principal yet; it will be minted with the correct kind at first login")
    }
    await client.query("COMMIT")

    const after = await client.query<{ role: string }>(`SELECT role FROM users WHERE id = $1`, [id])
    if (after.rows[0]?.role !== role) {
      throw new Error(`the role is still '${after.rows[0]?.role}' after the update`)
    }
    console.log("\napplied.")
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
