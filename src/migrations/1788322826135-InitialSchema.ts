import { MigrationInterface, QueryRunner } from "typeorm"

class InitialSchema1788322826135 implements MigrationInterface {
    name = 'InitialSchema1788322826135'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "merchants" ("id" SERIAL NOT NULL, "userId" integer NOT NULL, "storeName" character varying NOT NULL, "slug" character varying NOT NULL, "description" character varying, "businessRegistrationNumber" character varying NOT NULL, "taxId" character varying NOT NULL, "status" character varying NOT NULL DEFAULT 'pending', "verifiedAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_c4199d0353747c821386791f813" UNIQUE ("userId"), CONSTRAINT "UQ_66b19d9a264ff84db8e799a398f" UNIQUE ("slug"), CONSTRAINT "PK_4fd312ef25f8e05ad47bfe7ed25" PRIMARY KEY ("id"))`)
        await queryRunner.query(`CREATE TABLE "merchant_verifications" ("id" SERIAL NOT NULL, "userId" integer NOT NULL, "storeName" character varying NOT NULL, "businessRegistrationNumber" character varying NOT NULL, "taxId" character varying NOT NULL, "status" character varying NOT NULL DEFAULT 'pending', "verifiedAt" TIMESTAMP, CONSTRAINT "UQ_9c8939f7dcc4c9644d2ba8faaa3" UNIQUE ("userId"), CONSTRAINT "PK_cffc68836615f18792b4cfbc321" PRIMARY KEY ("id"))`)
        await queryRunner.query(`CREATE TABLE "profiles" ("id" SERIAL NOT NULL, "userId" integer NOT NULL, "fullName" character varying NOT NULL DEFAULT '', "phoneNumber" character varying NOT NULL DEFAULT '', "streetAddress" character varying NOT NULL DEFAULT '', "city" character varying NOT NULL DEFAULT '', "postalCode" character varying NOT NULL DEFAULT '', "avatarUrl" character varying, CONSTRAINT "UQ_315ecd98bd1a42dcf2ec4e2e985" UNIQUE ("userId"), CONSTRAINT "PK_8e520eb4da7dc01d0e190447c8e" PRIMARY KEY ("id"))`)
        await queryRunner.query(`CREATE TABLE "users" ("id" SERIAL NOT NULL, "email" character varying NOT NULL, "passwordHash" character varying NOT NULL, "role" character varying NOT NULL DEFAULT 'customer', "isTwoFactorEnabled" boolean NOT NULL DEFAULT false, "twoFactorSecret" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`)
        await queryRunner.query(`ALTER TABLE "profiles" ADD CONSTRAINT "FK_315ecd98bd1a42dcf2ec4e2e985" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`)
        await queryRunner.query(`ALTER TABLE "merchants" ADD CONSTRAINT "FK_c4199d0353747c821386791f813" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`)
        await queryRunner.query(`ALTER TABLE "merchant_verifications" ADD CONSTRAINT "FK_9c8939f7dcc4c9644d2ba8faaa3" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "merchant_verifications" DROP CONSTRAINT "FK_9c8939f7dcc4c9644d2ba8faaa3"`)
        await queryRunner.query(`ALTER TABLE "merchants" DROP CONSTRAINT "FK_c4199d0353747c821386791f813"`)
        await queryRunner.query(`ALTER TABLE "profiles" DROP CONSTRAINT "FK_315ecd98bd1a42dcf2ec4e2e985"`)
        await queryRunner.query(`DROP TABLE "users"`)
        await queryRunner.query(`DROP TABLE "profiles"`)
        await queryRunner.query(`DROP TABLE "merchant_verifications"`)
        await queryRunner.query(`DROP TABLE "merchants"`)
    }
}

export { InitialSchema1788322826135 }
