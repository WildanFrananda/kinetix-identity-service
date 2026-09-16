import * as bcrypt from "bcrypt"
import dataSource from "./data-source"
import UserTypeormEntity from "./infrastructure/persistence/entities/user_typeorm.entity"

async function main(): Promise<void> {
  const email = process.env.KINETIX_BOOTSTRAP_ADMIN_EMAIL
  const password = process.env.KINETIX_BOOTSTRAP_ADMIN_PASSWORD
  if (!email || !password) {
    throw new Error(
      "KINETIX_BOOTSTRAP_ADMIN_EMAIL and KINETIX_BOOTSTRAP_ADMIN_PASSWORD are both required " +
        "and have no defaults"
    )
  }
  if (password.length < 12) {
    throw new Error("the bootstrap admin password must be at least 12 characters")
  }

  await dataSource.initialize()
  try {
    const users = dataSource.getRepository(UserTypeormEntity)

    const existingAdmins = await users.count({ where: { role: "admin" } })
    if (existingAdmins > 0) {
      console.log(
        `this platform already has ${existingAdmins} admin account(s); nothing was created. ` +
          "Grant further administrators through an existing admin, not through this script."
      )
      return
    }

    const taken = await users.findOne({ where: { email } })
    if (taken) {
      throw new Error(
        `${email} is already registered as ${taken.role}; choose an address that is not in use`
      )
    }

    const saltRounds = 10
    const passwordHash = await bcrypt.hash(password, saltRounds)
    const created = await users.save(users.create({ email, passwordHash, role: "admin" }))

    console.log(`created admin ${created.email} (id ${created.id})`)
    console.log("log in once to mint its principal, then remove the password from the environment")
  } finally {
    await dataSource.destroy()
  }
}

main().catch((error: unknown) => {
  console.error("admin bootstrap failed:", error instanceof Error ? error.message : error)
  process.exit(1)
})
