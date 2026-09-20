import { MigrationInterface, QueryRunner } from "typeorm"

class MerchantStoreAddress1789300000000 implements MigrationInterface {
  name = "MerchantStoreAddress1789300000000"

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of ["merchant_verifications", "merchants"]) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD "streetAddress" character varying NOT NULL DEFAULT ''`
      )
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD "city" character varying NOT NULL DEFAULT ''`
      )
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD "postalCode" character varying NOT NULL DEFAULT ''`
      )
    }

    await queryRunner.query(`ALTER TABLE "merchants" ADD "latitude" double precision`)
    await queryRunner.query(`ALTER TABLE "merchants" ADD "longitude" double precision`)
    await queryRunner.query(`ALTER TABLE "merchants" ADD "geocodedAt" TIMESTAMP WITH TIME ZONE`)

    await queryRunner.query(`
      ALTER TABLE "merchants"
      ADD CONSTRAINT "CK_merchants_point_on_earth"
      CHECK (
        ("latitude" IS NULL AND "longitude" IS NULL)
        OR ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180)
      )
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "merchants" DROP CONSTRAINT "CK_merchants_point_on_earth"`)
    await queryRunner.query(`ALTER TABLE "merchants" DROP COLUMN "geocodedAt"`)
    await queryRunner.query(`ALTER TABLE "merchants" DROP COLUMN "longitude"`)
    await queryRunner.query(`ALTER TABLE "merchants" DROP COLUMN "latitude"`)

    for (const table of ["merchants", "merchant_verifications"]) {
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN "postalCode"`)
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN "city"`)
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN "streetAddress"`)
    }
  }
}

export { MerchantStoreAddress1789300000000 }
