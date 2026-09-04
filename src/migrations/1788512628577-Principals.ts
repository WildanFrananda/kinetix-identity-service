import { MigrationInterface, QueryRunner } from "typeorm"

class Principals1788512628577 implements MigrationInterface {
    name = 'Principals1788512628577'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`)

        await queryRunner.query(`CREATE TABLE "principals" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "kind" character varying(32) NOT NULL, "displayName" character varying(255), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_principals" PRIMARY KEY ("id"))`)

        await queryRunner.query(`CREATE TABLE "principal_aliases" ("id" SERIAL NOT NULL, "principalId" uuid NOT NULL, "service" character varying(32) NOT NULL, "localId" character varying(128) NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_principal_aliases_service_local_id" UNIQUE ("service", "localId"), CONSTRAINT "PK_principal_aliases" PRIMARY KEY ("id"))`)

        await queryRunner.query(`CREATE INDEX "ix_principal_aliases_service_local_id" ON "principal_aliases" ("service", "localId")`)

        await queryRunner.query(`ALTER TABLE "principal_aliases" ADD CONSTRAINT "FK_principal_aliases_principal" FOREIGN KEY ("principalId") REFERENCES "principals"("id") ON DELETE CASCADE ON UPDATE NO ACTION`)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "principal_aliases" DROP CONSTRAINT "FK_principal_aliases_principal"`)
        await queryRunner.query(`DROP INDEX "ix_principal_aliases_service_local_id"`)
        await queryRunner.query(`DROP TABLE "principal_aliases"`)
        await queryRunner.query(`DROP TABLE "principals"`)
    }
}

export { Principals1788512628577 }
