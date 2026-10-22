import { MigrationInterface, QueryRunner } from "typeorm"

class NoPlaceholderStoreDescription1789630000000 implements MigrationInterface {
  name = "NoPlaceholderStoreDescription1789630000000"

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "merchants" SET "description" = NULL WHERE "description" = 'Official Merchant Store'`
    )
  }

  public async down(): Promise<void> {
    return
  }
}

export { NoPlaceholderStoreDescription1789630000000 }
