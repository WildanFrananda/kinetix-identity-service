import { MigrationInterface, QueryRunner } from "typeorm"

class SignInAttempts1789640000000 implements MigrationInterface {
  name = "SignInAttempts1789640000000"

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "account_sign_in_attempts" (
        "accountKey" character varying(64) NOT NULL,
        "attempts" integer NOT NULL,
        "lastAttemptAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "delayedUntil" TIMESTAMP WITH TIME ZONE NOT NULL,
        CONSTRAINT "PK_account_sign_in_attempts" PRIMARY KEY ("accountKey")
      )
    `)
    await queryRunner.query(
      `CREATE INDEX "ix_account_sign_in_attempts_last_attempt" ON "account_sign_in_attempts" ("lastAttemptAt")`
    )
    await queryRunner.query(`
      CREATE TABLE "two_factor_challenge_attempts" (
        "jti" uuid NOT NULL,
        "attempts" integer NOT NULL,
        "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        CONSTRAINT "PK_two_factor_challenge_attempts" PRIMARY KEY ("jti")
      )
    `)
    await queryRunner.query(
      `CREATE INDEX "ix_two_factor_challenge_attempts_expires" ON "two_factor_challenge_attempts" ("expiresAt")`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "two_factor_challenge_attempts"`)
    await queryRunner.query(`DROP TABLE "account_sign_in_attempts"`)
  }
}

export { SignInAttempts1789640000000 }
