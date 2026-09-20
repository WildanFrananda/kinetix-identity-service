import { MigrationInterface, QueryRunner } from "typeorm"

class GeocodedAddresses1789100000000 implements MigrationInterface {
  name = "GeocodedAddresses1789100000000"

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "geocoded_addresses" (
        "id" SERIAL NOT NULL,
        "query" text NOT NULL,
        "latitude" double precision NOT NULL,
        "longitude" double precision NOT NULL,
        "provider" character varying NOT NULL,
        "precision" character varying NOT NULL DEFAULT 'UNSPECIFIED',
        "displayName" text,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_geocoded_addresses" PRIMARY KEY ("id")
      )
    `)

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_geocoded_addresses_query" ON "geocoded_addresses" ("query")
    `)

    await queryRunner.query(`
      ALTER TABLE "geocoded_addresses"
      ADD CONSTRAINT "CK_geocoded_addresses_on_earth"
      CHECK ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "geocoded_addresses"`)
  }
}

export { GeocodedAddresses1789100000000 }
