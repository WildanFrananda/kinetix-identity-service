import { MigrationInterface, QueryRunner } from "typeorm"

class CourierApplications1789620000000 implements MigrationInterface {
  name = "CourierApplications1789620000000"

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "courier_applications" (
        "id" SERIAL NOT NULL,
        "userId" integer NOT NULL,
        "principalId" uuid NOT NULL,
        "driverId" bigint,
        "status" character varying(16) NOT NULL DEFAULT 'pending',
        "filedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "approvedAt" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "UQ_courier_applications_user" UNIQUE ("userId"),
        CONSTRAINT "CK_courier_applications_status" CHECK ("status" IN ('pending', 'approved')),
        CONSTRAINT "PK_courier_applications" PRIMARY KEY ("id")
      )
    `)
    await queryRunner.query(`
      ALTER TABLE "courier_applications"
      ADD CONSTRAINT "FK_courier_applications_user"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `)
    await queryRunner.query(`
      ALTER TABLE "courier_applications"
      ADD CONSTRAINT "FK_courier_applications_principal"
      FOREIGN KEY ("principalId") REFERENCES "principals"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `)
    await queryRunner.query(`
      INSERT INTO "courier_applications" ("userId", "principalId", "status")
      SELECT "account"."id", "alias"."principalId", 'approved'
      FROM "users" "account"
      JOIN "principal_aliases" "alias"
        ON "alias"."service" = 'identity' AND "alias"."localId" = "account"."id"::text
      WHERE "account"."role" = 'courier'
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "courier_applications"`)
  }
}

export { CourierApplications1789620000000 }
