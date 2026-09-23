import { MigrationInterface, QueryRunner } from "typeorm"

class MerchantCursorPrecision1789400000000 implements MigrationInterface {
  name = "MerchantCursorPrecision1789400000000"

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "merchants" ALTER COLUMN "updatedAt" TYPE TIMESTAMP(3)`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "merchants" ALTER COLUMN "updatedAt" TYPE TIMESTAMP`)
  }
}

export { MerchantCursorPrecision1789400000000 }
