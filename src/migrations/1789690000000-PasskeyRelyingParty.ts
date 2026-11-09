import { MigrationInterface, QueryRunner } from "typeorm"

class PasskeyRelyingParty1789690000000 implements MigrationInterface {
  name = "PasskeyRelyingParty1789690000000"

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "passkeys" ADD "rpId" character varying(253)`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "passkeys" DROP COLUMN "rpId"`)
  }
}

export { PasskeyRelyingParty1789690000000 }
