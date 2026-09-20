import { MigrationInterface, QueryRunner } from "typeorm"

class ProfileCoordinates1789200000000 implements MigrationInterface {
  name = "ProfileCoordinates1789200000000"

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "profiles" ADD "latitude" double precision`)
    await queryRunner.query(`ALTER TABLE "profiles" ADD "longitude" double precision`)
    await queryRunner.query(`ALTER TABLE "profiles" ADD "geocodedAt" TIMESTAMP WITH TIME ZONE`)

    await queryRunner.query(`
      ALTER TABLE "profiles"
      ADD CONSTRAINT "CK_profiles_point_on_earth"
      CHECK (
        ("latitude" IS NULL AND "longitude" IS NULL)
        OR ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180)
      )
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "profiles" DROP CONSTRAINT "CK_profiles_point_on_earth"`)
    await queryRunner.query(`ALTER TABLE "profiles" DROP COLUMN "geocodedAt"`)
    await queryRunner.query(`ALTER TABLE "profiles" DROP COLUMN "longitude"`)
    await queryRunner.query(`ALTER TABLE "profiles" DROP COLUMN "latitude"`)
  }
}

export { ProfileCoordinates1789200000000 }
