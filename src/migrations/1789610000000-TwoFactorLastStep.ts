import { MigrationInterface, QueryRunner } from "typeorm"

class TwoFactorLastStep1789610000000 implements MigrationInterface {
  name = "TwoFactorLastStep1789610000000"

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "twoFactorLastStep" integer`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "twoFactorLastStep"`)
  }
}

export { TwoFactorLastStep1789610000000 }
