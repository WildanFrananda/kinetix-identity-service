import { MigrationInterface, QueryRunner } from "typeorm"

class CourierApplicationVehicle1789710000000 implements MigrationInterface {
  name = "CourierApplicationVehicle1789710000000"

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "courier_applications" DROP COLUMN "driverId"`)
    await queryRunner.query(`ALTER TABLE "courier_applications" ADD "vehiclePlate" character varying(32)`)
    await queryRunner.query(`ALTER TABLE "courier_applications" ADD "capacityKg" integer NOT NULL DEFAULT 0`)
    await queryRunner.query(`
      ALTER TABLE "courier_applications"
      ADD CONSTRAINT "UQ_courier_applications_vehicle_plate" UNIQUE ("vehiclePlate")
    `)
    await queryRunner.query(`
      ALTER TABLE "courier_applications"
      ADD CONSTRAINT "CK_courier_applications_capacity"
      CHECK ("capacityKg" >= 0 AND "capacityKg" <= 5000)
    `)
    await queryRunner.query(`
      ALTER TABLE "courier_applications"
      ADD CONSTRAINT "CK_courier_applications_vehicle_plate"
      CHECK ("vehiclePlate" IS NULL OR btrim("vehiclePlate") <> '')
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "courier_applications" DROP CONSTRAINT "CK_courier_applications_vehicle_plate"`)
    await queryRunner.query(`ALTER TABLE "courier_applications" DROP CONSTRAINT "CK_courier_applications_capacity"`)
    await queryRunner.query(`ALTER TABLE "courier_applications" DROP CONSTRAINT "UQ_courier_applications_vehicle_plate"`)
    await queryRunner.query(`ALTER TABLE "courier_applications" DROP COLUMN "capacityKg"`)
    await queryRunner.query(`ALTER TABLE "courier_applications" DROP COLUMN "vehiclePlate"`)
    await queryRunner.query(`ALTER TABLE "courier_applications" ADD "driverId" bigint`)
  }
}

export { CourierApplicationVehicle1789710000000 }
