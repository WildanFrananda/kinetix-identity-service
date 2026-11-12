import { MigrationInterface, QueryRunner } from "typeorm"

class ForgetUnplacedGeocodes1789700000000 implements MigrationInterface {
  name = "ForgetUnplacedGeocodes1789700000000"

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "geocoded_addresses" WHERE "precision" = 'UNSPECIFIED'`)
  }

  public async down(): Promise<void> {}
}

export { ForgetUnplacedGeocodes1789700000000 }
