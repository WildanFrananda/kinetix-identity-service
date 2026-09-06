import { MigrationInterface, QueryRunner } from "typeorm"
import { principalKindForRole } from "../domain/principal_kind"
import type { UserRole } from "../types/principal.type"

class PrincipalForEveryUser1789000000000 implements MigrationInterface {
  name = "PrincipalForEveryUser1789000000000"

  public async up(queryRunner: QueryRunner): Promise<void> {
    const unclaimed: Array<{ id: number; email: string; role: string }> = await queryRunner.query(`
      SELECT u."id", u."email", u."role"
      FROM "users" u
      WHERE NOT EXISTS (
        SELECT 1 FROM "principal_aliases" a
        WHERE a."service" = 'identity' AND a."localId" = u."id"::text
      )
      ORDER BY u."id"
    `)

    if (unclaimed.length === 0) {
      console.log("every user already has a principal")
      return
    }

    for (const user of unclaimed) {
      const kind = principalKindForRole(user.role as UserRole)

      const [principal]: Array<{ id: string }> = await queryRunner.query(
        `INSERT INTO "principals" ("kind", "displayName") VALUES ($1, $2) RETURNING "id"`,
        [kind, user.email]
      )

      await queryRunner.query(
        `INSERT INTO "principal_aliases" ("principalId", "service", "localId")
         VALUES ($1, 'identity', $2)
         ON CONFLICT ("service", "localId") DO NOTHING`,
        [principal.id, String(user.id)]
      )
    }

    console.log(`minted ${unclaimed.length} principal(s) for users that had none`)
  }

  public async down(): Promise<void> {}
}

export { PrincipalForEveryUser1789000000000 }
