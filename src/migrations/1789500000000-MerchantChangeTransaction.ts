import { MigrationInterface, QueryRunner } from "typeorm"

class MerchantChangeTransaction1789500000000 implements MigrationInterface {
  name = "MerchantChangeTransaction1789500000000"

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "merchant_change_feed" (
        "merchant_id" integer PRIMARY KEY REFERENCES "merchants" ("id") ON DELETE CASCADE,
        "change_transaction_id" xid8 NOT NULL
      )
    `)
    await queryRunner.query(`
      INSERT INTO "merchant_change_feed" ("merchant_id", "change_transaction_id")
      SELECT "id", pg_current_xact_id() FROM "merchants"
    `)
    await queryRunner.query(`
      CREATE FUNCTION merchants_record_change_transaction() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        INSERT INTO "merchant_change_feed" ("merchant_id", "change_transaction_id")
        VALUES (NEW."id", pg_current_xact_id())
        ON CONFLICT ("merchant_id") DO UPDATE
          SET "change_transaction_id" = EXCLUDED."change_transaction_id";
        RETURN NULL;
      END
      $$
    `)
    await queryRunner.query(`
      CREATE TRIGGER merchants_record_change_transaction
      AFTER INSERT OR UPDATE ON "merchants"
      FOR EACH ROW EXECUTE FUNCTION merchants_record_change_transaction()
    `)
    await queryRunner.query(`
      CREATE INDEX "merchant_change_feed_order_idx"
      ON "merchant_change_feed" ("change_transaction_id", "merchant_id")
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER merchants_record_change_transaction ON "merchants"`)
    await queryRunner.query(`DROP FUNCTION merchants_record_change_transaction()`)
    await queryRunner.query(`DROP TABLE "merchant_change_feed"`)
  }
}

export { MerchantChangeTransaction1789500000000 }
