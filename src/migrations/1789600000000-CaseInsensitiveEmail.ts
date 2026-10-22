import { MigrationInterface, QueryRunner } from "typeorm"

class CaseInsensitiveEmail1789600000000 implements MigrationInterface {
  name = "CaseInsensitiveEmail1789600000000"

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_users_email_lower" ON "users" (lower("email"))`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "UQ_users_email_lower"`)
  }
}

export { CaseInsensitiveEmail1789600000000 }
