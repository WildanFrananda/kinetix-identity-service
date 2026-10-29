import { MigrationInterface, QueryRunner } from "typeorm"

class SellerApplicationRejectedAt1789670000000 implements MigrationInterface {
  name = "SellerApplicationRejectedAt1789670000000"

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "merchant_verifications" ADD "rejectedAt" TIMESTAMP WITH TIME ZONE`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "merchant_verifications" DROP COLUMN "rejectedAt"`)
  }
}

export { SellerApplicationRejectedAt1789670000000 }
