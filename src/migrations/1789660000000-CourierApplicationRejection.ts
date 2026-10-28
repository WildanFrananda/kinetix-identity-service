import { MigrationInterface, QueryRunner } from "typeorm"

class CourierApplicationRejection1789660000000 implements MigrationInterface {
  name = "CourierApplicationRejection1789660000000"

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "courier_applications" DROP CONSTRAINT "CK_courier_applications_status"`)
    await queryRunner.query(`
      ALTER TABLE "courier_applications"
      ADD CONSTRAINT "CK_courier_applications_status" CHECK ("status" IN ('pending', 'approved', 'rejected'))
    `)
    await queryRunner.query(`ALTER TABLE "courier_applications" ADD "rejectedAt" TIMESTAMP WITH TIME ZONE`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE "courier_applications" SET "status" = 'pending' WHERE "status" = 'rejected'`)
    await queryRunner.query(`ALTER TABLE "courier_applications" DROP COLUMN "rejectedAt"`)
    await queryRunner.query(`ALTER TABLE "courier_applications" DROP CONSTRAINT "CK_courier_applications_status"`)
    await queryRunner.query(`
      ALTER TABLE "courier_applications"
      ADD CONSTRAINT "CK_courier_applications_status" CHECK ("status" IN ('pending', 'approved'))
    `)
  }
}

export { CourierApplicationRejection1789660000000 }
