import { MigrationInterface, QueryRunner } from "typeorm"

class ProfileProvenance1788950000000 implements MigrationInterface {
    name = 'ProfileProvenance1788950000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "profiles" ADD "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`)
        await queryRunner.query(`ALTER TABLE "profiles" ADD "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`)
        await queryRunner.query(`CREATE INDEX "ix_profiles_created" ON "profiles" ("createdAt")`)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "ix_profiles_created"`)
        await queryRunner.query(`ALTER TABLE "profiles" DROP COLUMN "updatedAt"`)
        await queryRunner.query(`ALTER TABLE "profiles" DROP COLUMN "createdAt"`)
    }
}

export { ProfileProvenance1788950000000 }
