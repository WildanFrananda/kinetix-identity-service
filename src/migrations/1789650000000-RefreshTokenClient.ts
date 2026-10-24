import { MigrationInterface, QueryRunner } from "typeorm"

class RefreshTokenClient1789650000000 implements MigrationInterface {
  name = "RefreshTokenClient1789650000000"

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "refresh_tokens" ADD "client" character varying(64)`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "refresh_tokens" DROP COLUMN "client"`)
  }
}

export { RefreshTokenClient1789650000000 }
