import { MigrationInterface, QueryRunner } from "typeorm"

class Passkeys1789680000000 implements MigrationInterface {
  name = "Passkeys1789680000000"

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "passkeys" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "userId" integer NOT NULL,
        "credentialId" text NOT NULL,
        "publicKey" bytea NOT NULL,
        "signCount" bigint NOT NULL,
        "transports" text array NOT NULL,
        "deviceType" character varying(32) NOT NULL,
        "backedUp" boolean NOT NULL,
        "name" character varying(64) NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "lastUsedAt" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "UQ_passkeys_credential_id" UNIQUE ("credentialId"),
        CONSTRAINT "CK_passkeys_device_type" CHECK ("deviceType" IN ('singleDevice', 'multiDevice')),
        CONSTRAINT "PK_passkeys" PRIMARY KEY ("id")
      )
    `)

    await queryRunner.query(`CREATE INDEX "ix_passkeys_user" ON "passkeys" ("userId")`)
    await queryRunner.query(`
      ALTER TABLE "passkeys"
      ADD CONSTRAINT "FK_passkeys_user"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `)

    await queryRunner.query(`
      CREATE TABLE "passkey_challenges" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "userId" integer NOT NULL,
        "purpose" character varying(16) NOT NULL,
        "challenge" text NOT NULL,
        "mfaJti" uuid,
        "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "usedAt" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "UQ_passkey_challenges_mfa_jti" UNIQUE ("mfaJti"),
        CONSTRAINT "CK_passkey_challenges_purpose" CHECK ("purpose" IN ('register', 'sign_in')),
        CONSTRAINT "CK_passkey_challenges_mfa_jti" CHECK (("purpose" = 'sign_in') = ("mfaJti" IS NOT NULL)),
        CONSTRAINT "PK_passkey_challenges" PRIMARY KEY ("id")
      )
    `)

    await queryRunner.query(
      `CREATE INDEX "ix_passkey_challenges_expires" ON "passkey_challenges" ("expiresAt")`
    )

    await queryRunner.query(`
      ALTER TABLE "passkey_challenges"
      ADD CONSTRAINT "FK_passkey_challenges_user"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "passkey_challenges"`)
    await queryRunner.query(`DROP TABLE "passkeys"`)
  }
}

export { Passkeys1789680000000 }
