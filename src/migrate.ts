import dataSource from "./data-source"

async function main(): Promise<void> {
  await dataSource.initialize()
  try {
    const pending = await dataSource.showMigrations()
    if (!pending) {
      console.log("schema is up to date; no migrations to apply")
      return
    }

    const applied = await dataSource.runMigrations({ transaction: "all" })
    if (applied.length === 0) {
      console.log("no migrations were applied")
      return
    }
    for (const migration of applied) {
      console.log(`applied ${migration.name}`)
    }
  } finally {
    await dataSource.destroy()
  }
}

main().catch((error: unknown) => {
  console.error("migration failed:", error instanceof Error ? error.message : error)
  process.exit(1)
})
