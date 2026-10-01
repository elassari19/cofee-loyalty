import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddLoyaltyIdentityToken1790872971370 implements MigrationInterface {
  name = "AddLoyaltyIdentityToken1790872971370";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "loyalty_identity_token" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "merchant_id" uuid NOT NULL, "customer_profile_id" uuid NOT NULL, "membership_id" uuid NOT NULL, "token" character varying(128) NOT NULL, "status" character varying(20) NOT NULL DEFAULT 'active', "issued_to" character varying(64), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "revoked_at" TIMESTAMP WITH TIME ZONE, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_loyalty_identity_token_token" UNIQUE ("token"), CONSTRAINT "ck_loyalty_identity_token_status" CHECK (status IN ('active', 'revoked')), CONSTRAINT "ck_loyalty_identity_token_revoked_at" CHECK (status = 'active' OR revoked_at IS NOT NULL), CONSTRAINT "PK_d70567953dd2c4473c54ceacb07" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TRIGGER trg_loyalty_identity_token_updated_at BEFORE UPDATE ON "loyalty_identity_token" FOR EACH ROW EXECUTE FUNCTION set_updated_at()`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_loyalty_identity_token_active_membership" ON "loyalty_identity_token" ("membership_id") WHERE status = 'active'`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_loyalty_identity_token_merchant_status" ON "loyalty_identity_token" ("merchant_id", "status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_loyalty_identity_token_membership" ON "loyalty_identity_token" ("membership_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "loyalty_identity_token" ADD CONSTRAINT "fk_loyalty_identity_token_merchant" FOREIGN KEY ("merchant_id") REFERENCES "merchant"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "loyalty_identity_token" ADD CONSTRAINT "fk_loyalty_identity_token_customer_profile" FOREIGN KEY ("customer_profile_id") REFERENCES "customer_profile"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "loyalty_identity_token" ADD CONSTRAINT "fk_loyalty_identity_token_membership" FOREIGN KEY ("membership_id") REFERENCES "loyalty_membership"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "loyalty_identity_token" ADD CONSTRAINT "fk_loyalty_identity_token_issued_to" FOREIGN KEY ("issued_to") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "loyalty_identity_token" DROP CONSTRAINT "fk_loyalty_identity_token_issued_to"`,
    );
    await queryRunner.query(
      `ALTER TABLE "loyalty_identity_token" DROP CONSTRAINT "fk_loyalty_identity_token_membership"`,
    );
    await queryRunner.query(
      `ALTER TABLE "loyalty_identity_token" DROP CONSTRAINT "fk_loyalty_identity_token_customer_profile"`,
    );
    await queryRunner.query(
      `ALTER TABLE "loyalty_identity_token" DROP CONSTRAINT "fk_loyalty_identity_token_merchant"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."ix_loyalty_identity_token_membership"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."ix_loyalty_identity_token_merchant_status"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."uq_loyalty_identity_token_active_membership"`,
    );
    await queryRunner.query(`DROP TABLE "loyalty_identity_token"`);
  }
}
