import { MigrationInterface, QueryRunner } from "typeorm"

class TokenLifecycle1788900000000 implements MigrationInterface {
    name = 'TokenLifecycle1788900000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "refresh_tokens" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "jti" uuid NOT NULL, "familyId" uuid NOT NULL, "principalId" uuid NOT NULL, "userId" integer NOT NULL, "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "usedAt" TIMESTAMP WITH TIME ZONE, "revokedAt" TIMESTAMP WITH TIME ZONE, "revokedReason" character varying(32), "replacedByJti" uuid, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_refresh_tokens_jti" UNIQUE ("jti"), CONSTRAINT "PK_refresh_tokens" PRIMARY KEY ("id"))`)

        await queryRunner.query(`CREATE INDEX "ix_refresh_tokens_family" ON "refresh_tokens" ("familyId")`)
        await queryRunner.query(`CREATE INDEX "ix_refresh_tokens_principal" ON "refresh_tokens" ("principalId")`)

        await queryRunner.query(`ALTER TABLE "refresh_tokens" ADD CONSTRAINT "FK_refresh_tokens_principal" FOREIGN KEY ("principalId") REFERENCES "principals"("id") ON DELETE CASCADE ON UPDATE NO ACTION`)

        await queryRunner.query(`CREATE TABLE "revoked_access_tokens" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "jti" uuid NOT NULL, "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "reason" character varying(32) NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_revoked_access_tokens_jti" UNIQUE ("jti"), CONSTRAINT "PK_revoked_access_tokens" PRIMARY KEY ("id"))`)

        await queryRunner.query(`CREATE INDEX "ix_revoked_access_tokens_expires" ON "revoked_access_tokens" ("expiresAt")`)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "ix_revoked_access_tokens_expires"`)
        await queryRunner.query(`DROP TABLE "revoked_access_tokens"`)
        await queryRunner.query(`ALTER TABLE "refresh_tokens" DROP CONSTRAINT "FK_refresh_tokens_principal"`)
        await queryRunner.query(`DROP INDEX "ix_refresh_tokens_principal"`)
        await queryRunner.query(`DROP INDEX "ix_refresh_tokens_family"`)
        await queryRunner.query(`DROP TABLE "refresh_tokens"`)
    }
}

export { TokenLifecycle1788900000000 }
