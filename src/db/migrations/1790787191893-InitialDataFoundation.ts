// `import type` is required: TypeORM loads migration files with a native
// dynamic import at DataSource init, where a value import of these type-only
// symbols would fail at runtime. Future generated migrations need the same
// one-line change (docs/database.md).
import type { MigrationInterface, QueryRunner } from "typeorm";

export class InitialDataFoundation1790787191893 implements MigrationInterface {
  name = "InitialDataFoundation1790787191893";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "user" ("id" character varying(64) NOT NULL, "name" character varying(200) NOT NULL, "email" character varying(320) NOT NULL, "email_verified" boolean NOT NULL DEFAULT false, "image" character varying(500), "role" character varying(30) NOT NULL DEFAULT 'CUSTOMER', "status" character varying(20) NOT NULL DEFAULT 'active', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_user_email" UNIQUE ("email"), CONSTRAINT "ck_user_role" CHECK (role IN ('SUPER_ADMIN', 'MERCHANT', 'CUSTOMER')), CONSTRAINT "ck_user_status" CHECK (status IN ('active', 'invited', 'disabled')), CONSTRAINT "PK_cace4a159ff9f2512dd42373760" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "subscription" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "merchant_id" uuid NOT NULL, "plan" character varying(20) NOT NULL DEFAULT 'FREE', "status" character varying(20) NOT NULL DEFAULT 'active', "limits" jsonb NOT NULL DEFAULT '{}', "provider" character varying(60), "provider_reference" character varying(200), "started_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "renews_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_subscription_merchant" UNIQUE ("merchant_id"), CONSTRAINT "uq_subscription_provider_reference" UNIQUE ("provider", "provider_reference"), CONSTRAINT "ck_subscription_plan" CHECK (plan IN ('FREE', 'STARTER', 'PRO', 'BUSINESS')), CONSTRAINT "ck_subscription_status" CHECK (status IN ('trialing', 'active', 'past_due', 'cancelled')), CONSTRAINT "ck_subscription_renews_after_start" CHECK (renews_at IS NULL OR renews_at > started_at), CONSTRAINT "PK_8c3e00ebd02103caa1174cd5d9d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "reward" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "merchant_id" uuid NOT NULL, "name" character varying(200) NOT NULL, "description" text, "terms" text, "image_url" character varying(500), "cost" integer NOT NULL, "unit" character varying(10) NOT NULL, "status" character varying(20) NOT NULL DEFAULT 'active', "expires_at" TIMESTAMP WITH TIME ZONE, "redemption_limit" integer, "redemption_count" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "ck_reward_cost" CHECK (cost >= 1), CONSTRAINT "ck_reward_unit" CHECK (unit IN ('POINTS', 'STAMPS')), CONSTRAINT "ck_reward_status" CHECK (status IN ('active', 'inactive')), CONSTRAINT "ck_reward_redemption_limit" CHECK (redemption_limit IS NULL OR redemption_limit >= 1), CONSTRAINT "ck_reward_redemption_count" CHECK (redemption_count >= 0), CONSTRAINT "ck_reward_redemption_count_within_limit" CHECK (redemption_limit IS NULL OR redemption_count <= redemption_limit), CONSTRAINT "PK_a90ea606c229e380fb341838036" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_reward_merchant_status" ON "reward" ("merchant_id", "status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_reward_merchant_created" ON "reward" ("merchant_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "reward_redemption" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "merchant_id" uuid NOT NULL, "membership_id" uuid NOT NULL, "reward_id" uuid NOT NULL, "unit" character varying(10) NOT NULL, "cost" integer NOT NULL, "code_hash" character varying(64) NOT NULL, "status" character varying(20) NOT NULL DEFAULT 'ISSUED', "expires_at" TIMESTAMP WITH TIME ZONE, "requested_by" character varying(64), "verified_by" character varying(64), "verified_at" TIMESTAMP WITH TIME ZONE, "redeemed_by" character varying(64), "redeemed_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_reward_redemption_code" UNIQUE ("code_hash"), CONSTRAINT "ck_reward_redemption_cost" CHECK (cost >= 1), CONSTRAINT "ck_reward_redemption_unit" CHECK (unit IN ('POINTS', 'STAMPS')), CONSTRAINT "ck_reward_redemption_status" CHECK (status IN ('ISSUED', 'VERIFIED', 'REDEEMED', 'EXPIRED', 'CANCELLED')), CONSTRAINT "ck_reward_redemption_verified_audit" CHECK (status NOT IN ('VERIFIED', 'REDEEMED') OR (verified_at IS NOT NULL AND verified_by IS NOT NULL)), CONSTRAINT "ck_reward_redemption_redeemed_audit" CHECK (status <> 'REDEEMED' OR (redeemed_at IS NOT NULL AND redeemed_by IS NOT NULL)), CONSTRAINT "PK_da4479f0727ddeb14fd6f3130a5" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_reward_redemption_tenant_status_created" ON "reward_redemption" ("merchant_id", "status", "created_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_reward_redemption_merchant_reward" ON "reward_redemption" ("merchant_id", "reward_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_reward_redemption_membership" ON "reward_redemption" ("membership_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "merchant" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "name" character varying(200) NOT NULL, "slug" character varying(100) NOT NULL, "logo_url" character varying(500), "description" text, "category" character varying(80), "address" text, "phone" character varying(40), "email" character varying(320), "website" character varying(500), "currency" character varying(3) NOT NULL DEFAULT 'EUR', "timezone" character varying(64) NOT NULL DEFAULT 'UTC', "status" character varying(20) NOT NULL DEFAULT 'trial', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_merchant_slug" UNIQUE ("slug"), CONSTRAINT "ck_merchant_status" CHECK (status IN ('trial', 'active', 'suspended')), CONSTRAINT "ck_merchant_currency" CHECK (currency ~ '^[A-Z]{3}$'), CONSTRAINT "ck_merchant_timezone" CHECK (length(btrim(timezone)) > 0), CONSTRAINT "PK_9a3850e0537d869734fc9bff5d6" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_merchant_status" ON "merchant" ("status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_merchant_created_at" ON "merchant" ("created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "merchant_membership" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "merchant_id" uuid NOT NULL, "user_id" character varying(64) NOT NULL, "role" character varying(30) NOT NULL, "status" character varying(20) NOT NULL DEFAULT 'active', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_merchant_membership_merchant_user" UNIQUE ("merchant_id", "user_id"), CONSTRAINT "ck_merchant_membership_role" CHECK (role IN ('MERCHANT_OWNER', 'MERCHANT_MANAGER', 'MERCHANT_STAFF')), CONSTRAINT "ck_merchant_membership_status" CHECK (status IN ('active', 'invited', 'disabled')), CONSTRAINT "PK_5d2956cb6d672a2a08922f9adcc" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_merchant_membership_user" ON "merchant_membership" ("user_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_merchant_membership_merchant_status" ON "merchant_membership" ("merchant_id", "status") `,
    );
    await queryRunner.query(
      `CREATE TABLE "loyalty_transaction" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "merchant_id" uuid NOT NULL, "membership_id" uuid NOT NULL, "customer_profile_id" uuid NOT NULL, "program_id" uuid, "rule_version" integer, "type" character varying(30) NOT NULL, "unit" character varying(10) NOT NULL, "delta" integer NOT NULL, "purchase_amount" numeric(12,2), "currency" character varying(3), "reason" character varying(200), "reward_id" uuid, "redemption_id" uuid, "created_by" character varying(64), "idempotency_key" character varying(120), "external_ref" character varying(120), "metadata" jsonb NOT NULL DEFAULT '{}', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_loyalty_transaction_idempotency" UNIQUE ("merchant_id", "idempotency_key"), CONSTRAINT "uq_loyalty_transaction_external_ref" UNIQUE ("merchant_id", "external_ref"), CONSTRAINT "ck_loyalty_transaction_type" CHECK (type IN ('POINTS_EARNED', 'POINTS_ADJUSTED', 'POINTS_REDEEMED', 'STAMP_EARNED', 'STAMP_ADJUSTED', 'STAMP_REDEEMED', 'REWARD_REDEEMED')), CONSTRAINT "ck_loyalty_transaction_unit" CHECK (unit IN ('POINTS', 'STAMPS')), CONSTRAINT "ck_loyalty_transaction_type_unit" CHECK ((type IN ('POINTS_EARNED', 'POINTS_ADJUSTED', 'POINTS_REDEEMED') AND unit = 'POINTS') OR (type IN ('STAMP_EARNED', 'STAMP_ADJUSTED', 'STAMP_REDEEMED') AND unit = 'STAMPS') OR (type = 'REWARD_REDEEMED' AND unit IN ('POINTS', 'STAMPS'))), CONSTRAINT "ck_loyalty_transaction_delta_sign" CHECK ((type IN ('POINTS_EARNED', 'STAMP_EARNED') AND delta > 0) OR (type IN ('POINTS_REDEEMED', 'STAMP_REDEEMED') AND delta < 0) OR (type IN ('POINTS_ADJUSTED', 'STAMP_ADJUSTED') AND delta <> 0) OR (type = 'REWARD_REDEEMED' AND delta < 0)), CONSTRAINT "ck_loyalty_transaction_purchase_amount" CHECK (purchase_amount IS NULL OR purchase_amount > 0), CONSTRAINT "ck_loyalty_transaction_adjustment_reason" CHECK (type NOT IN ('POINTS_ADJUSTED', 'STAMP_ADJUSTED') OR length(btrim(reason)) > 0), CONSTRAINT "ck_loyalty_transaction_currency" CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'), CONSTRAINT "PK_bd11fc39ae5ebd6039fcb3cb1c5" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_loyalty_transaction_membership_created" ON "loyalty_transaction" ("membership_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_loyalty_transaction_tenant_customer_created" ON "loyalty_transaction" ("merchant_id", "customer_profile_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_loyalty_transaction_tenant_created" ON "loyalty_transaction" ("merchant_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_loyalty_transaction_redemption" ON "loyalty_transaction" ("redemption_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "loyalty_program" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "merchant_id" uuid NOT NULL, "type" character varying(20) NOT NULL, "name" character varying(200) NOT NULL, "description" text, "unit_name" character varying(60), "configuration" jsonb NOT NULL DEFAULT '{}', "rule_version" integer NOT NULL DEFAULT '1', "status" character varying(20) NOT NULL DEFAULT 'draft', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "ck_loyalty_program_type" CHECK (type IN ('POINTS', 'STAMPS')), CONSTRAINT "ck_loyalty_program_status" CHECK (status IN ('draft', 'active', 'archived')), CONSTRAINT "ck_loyalty_program_rule_version" CHECK (rule_version >= 1), CONSTRAINT "PK_926584ab2a6ed625138cce7c134" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_loyalty_program_merchant" ON "loyalty_program" ("merchant_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_loyalty_program_active_per_merchant" ON "loyalty_program" ("merchant_id") WHERE status = 'active'`,
    );
    await queryRunner.query(
      `CREATE TABLE "loyalty_membership" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "merchant_id" uuid NOT NULL, "customer_profile_id" uuid NOT NULL, "balance" integer NOT NULL DEFAULT '0', "status" character varying(20) NOT NULL DEFAULT 'active', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_loyalty_membership_merchant_customer" UNIQUE ("merchant_id", "customer_profile_id"), CONSTRAINT "ck_loyalty_membership_balance" CHECK (balance >= 0), CONSTRAINT "ck_loyalty_membership_status" CHECK (status IN ('active', 'closed')), CONSTRAINT "PK_69e09e29585eb8632d4603408a4" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_loyalty_membership_customer" ON "loyalty_membership" ("customer_profile_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_loyalty_membership_merchant_status" ON "loyalty_membership" ("merchant_id", "status") `,
    );
    await queryRunner.query(
      `CREATE TABLE "integration_record" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "merchant_id" uuid NOT NULL, "provider" character varying(60) NOT NULL, "entity_type" character varying(40) NOT NULL, "entity_id" character varying(64) NOT NULL, "external_id" character varying(200) NOT NULL, "metadata" jsonb NOT NULL DEFAULT '{}', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_integration_record_external" UNIQUE ("provider", "merchant_id", "external_id"), CONSTRAINT "ck_integration_record_entity_type" CHECK (entity_type IN ('merchant', 'customer_profile', 'loyalty_membership')), CONSTRAINT "ck_integration_record_external_id" CHECK (length(btrim(external_id)) > 0), CONSTRAINT "PK_87c4f953942c40abfe9fdb80c5d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_integration_record_tenant_entity" ON "integration_record" ("merchant_id", "entity_type", "entity_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "customer_profile" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "user_id" character varying(64) NOT NULL, "name" character varying(200) NOT NULL, "phone" character varying(40), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_customer_profile_user" UNIQUE ("user_id"), CONSTRAINT "PK_d3e8a37b75a6e92258188f59403" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_customer_profile_name" ON "customer_profile" ("name") `,
    );
    await queryRunner.query(
      `CREATE TABLE "campaign" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "merchant_id" uuid NOT NULL, "name" character varying(200) NOT NULL, "description" text, "terms" text, "image_url" character varying(500), "audience" character varying(40) NOT NULL DEFAULT 'ALL_CUSTOMERS', "configuration" jsonb NOT NULL DEFAULT '{}', "start_at" TIMESTAMP WITH TIME ZONE NOT NULL, "end_at" TIMESTAMP WITH TIME ZONE NOT NULL, "status" character varying(20) NOT NULL DEFAULT 'DRAFT', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "ck_campaign_audience" CHECK (audience IN ('ALL_CUSTOMERS')), CONSTRAINT "ck_campaign_status" CHECK (status IN ('DRAFT', 'SCHEDULED', 'ACTIVE', 'ENDED', 'ARCHIVED')), CONSTRAINT "ck_campaign_window" CHECK (end_at > start_at), CONSTRAINT "PK_0ce34d26e7f2eb316a3a592cdc4" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_campaign_tenant_status_window" ON "campaign" ("merchant_id", "status", "start_at", "end_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "audit_log" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "merchant_id" uuid, "actor_id" character varying(64), "actor_role" character varying(30), "action" character varying(80) NOT NULL, "resource" character varying(80) NOT NULL, "resource_id" character varying(120), "metadata" jsonb NOT NULL DEFAULT '{}', "ip_address" character varying(45), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "ck_audit_log_action" CHECK (length(btrim(action)) > 0), CONSTRAINT "ck_audit_log_resource" CHECK (length(btrim(resource)) > 0), CONSTRAINT "PK_07fefa57f7f5ab8fc3f52b3ed0b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_audit_log_tenant_created" ON "audit_log" ("merchant_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_audit_log_actor_created" ON "audit_log" ("actor_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_audit_log_action_created" ON "audit_log" ("action", "created_at") `,
    );
    await queryRunner.query(`CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            NEW.updated_at := now();
            RETURN NEW;
        END;
        $$`);
    await queryRunner.query(
      `CREATE TRIGGER trg_user_updated_at BEFORE UPDATE ON "user" FOR EACH ROW EXECUTE FUNCTION set_updated_at()`,
    );
    await queryRunner.query(
      `CREATE TRIGGER trg_customer_profile_updated_at BEFORE UPDATE ON "customer_profile" FOR EACH ROW EXECUTE FUNCTION set_updated_at()`,
    );
    await queryRunner.query(
      `CREATE TRIGGER trg_merchant_updated_at BEFORE UPDATE ON "merchant" FOR EACH ROW EXECUTE FUNCTION set_updated_at()`,
    );
    await queryRunner.query(
      `CREATE TRIGGER trg_merchant_membership_updated_at BEFORE UPDATE ON "merchant_membership" FOR EACH ROW EXECUTE FUNCTION set_updated_at()`,
    );
    await queryRunner.query(
      `CREATE TRIGGER trg_loyalty_program_updated_at BEFORE UPDATE ON "loyalty_program" FOR EACH ROW EXECUTE FUNCTION set_updated_at()`,
    );
    await queryRunner.query(
      `CREATE TRIGGER trg_loyalty_membership_updated_at BEFORE UPDATE ON "loyalty_membership" FOR EACH ROW EXECUTE FUNCTION set_updated_at()`,
    );
    await queryRunner.query(
      `CREATE TRIGGER trg_reward_updated_at BEFORE UPDATE ON "reward" FOR EACH ROW EXECUTE FUNCTION set_updated_at()`,
    );
    await queryRunner.query(
      `CREATE TRIGGER trg_reward_redemption_updated_at BEFORE UPDATE ON "reward_redemption" FOR EACH ROW EXECUTE FUNCTION set_updated_at()`,
    );
    await queryRunner.query(
      `CREATE TRIGGER trg_campaign_updated_at BEFORE UPDATE ON "campaign" FOR EACH ROW EXECUTE FUNCTION set_updated_at()`,
    );
    await queryRunner.query(
      `CREATE TRIGGER trg_subscription_updated_at BEFORE UPDATE ON "subscription" FOR EACH ROW EXECUTE FUNCTION set_updated_at()`,
    );
    await queryRunner.query(
      `CREATE TRIGGER trg_integration_record_updated_at BEFORE UPDATE ON "integration_record" FOR EACH ROW EXECUTE FUNCTION set_updated_at()`,
    );
    await queryRunner.query(`CREATE FUNCTION prevent_row_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            RAISE EXCEPTION '% is append-only: rows cannot be %', TG_TABLE_NAME, TG_OP
                USING ERRCODE = '23514';
        END;
        $$`);
    await queryRunner.query(
      `CREATE TRIGGER trg_loyalty_transaction_append_only BEFORE UPDATE OR DELETE ON "loyalty_transaction" FOR EACH ROW EXECUTE FUNCTION prevent_row_mutation()`,
    );
    await queryRunner.query(
      `CREATE TRIGGER trg_audit_log_append_only BEFORE UPDATE OR DELETE ON "audit_log" FOR EACH ROW EXECUTE FUNCTION prevent_row_mutation()`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscription" ADD CONSTRAINT "fk_subscription_merchant" FOREIGN KEY ("merchant_id") REFERENCES "merchant"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "reward" ADD CONSTRAINT "fk_reward_merchant" FOREIGN KEY ("merchant_id") REFERENCES "merchant"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "reward_redemption" ADD CONSTRAINT "fk_reward_redemption_merchant" FOREIGN KEY ("merchant_id") REFERENCES "merchant"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "reward_redemption" ADD CONSTRAINT "fk_reward_redemption_membership" FOREIGN KEY ("membership_id") REFERENCES "loyalty_membership"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "reward_redemption" ADD CONSTRAINT "fk_reward_redemption_reward" FOREIGN KEY ("reward_id") REFERENCES "reward"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "reward_redemption" ADD CONSTRAINT "fk_reward_redemption_requested_by" FOREIGN KEY ("requested_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "reward_redemption" ADD CONSTRAINT "fk_reward_redemption_verified_by" FOREIGN KEY ("verified_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "reward_redemption" ADD CONSTRAINT "fk_reward_redemption_redeemed_by" FOREIGN KEY ("redeemed_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "merchant_membership" ADD CONSTRAINT "fk_merchant_membership_merchant" FOREIGN KEY ("merchant_id") REFERENCES "merchant"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "merchant_membership" ADD CONSTRAINT "fk_merchant_membership_user" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "loyalty_transaction" ADD CONSTRAINT "fk_loyalty_transaction_merchant" FOREIGN KEY ("merchant_id") REFERENCES "merchant"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "loyalty_transaction" ADD CONSTRAINT "fk_loyalty_transaction_membership" FOREIGN KEY ("membership_id") REFERENCES "loyalty_membership"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "loyalty_transaction" ADD CONSTRAINT "fk_loyalty_transaction_customer_profile" FOREIGN KEY ("customer_profile_id") REFERENCES "customer_profile"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "loyalty_transaction" ADD CONSTRAINT "fk_loyalty_transaction_program" FOREIGN KEY ("program_id") REFERENCES "loyalty_program"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "loyalty_transaction" ADD CONSTRAINT "fk_loyalty_transaction_reward" FOREIGN KEY ("reward_id") REFERENCES "reward"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "loyalty_transaction" ADD CONSTRAINT "fk_loyalty_transaction_redemption" FOREIGN KEY ("redemption_id") REFERENCES "reward_redemption"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "loyalty_transaction" ADD CONSTRAINT "fk_loyalty_transaction_created_by" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "loyalty_program" ADD CONSTRAINT "fk_loyalty_program_merchant" FOREIGN KEY ("merchant_id") REFERENCES "merchant"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "loyalty_membership" ADD CONSTRAINT "fk_loyalty_membership_merchant" FOREIGN KEY ("merchant_id") REFERENCES "merchant"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "loyalty_membership" ADD CONSTRAINT "fk_loyalty_membership_customer_profile" FOREIGN KEY ("customer_profile_id") REFERENCES "customer_profile"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "integration_record" ADD CONSTRAINT "fk_integration_record_merchant" FOREIGN KEY ("merchant_id") REFERENCES "merchant"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "customer_profile" ADD CONSTRAINT "fk_customer_profile_user" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "campaign" ADD CONSTRAINT "fk_campaign_merchant" FOREIGN KEY ("merchant_id") REFERENCES "merchant"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_log" ADD CONSTRAINT "fk_audit_log_merchant" FOREIGN KEY ("merchant_id") REFERENCES "merchant"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "audit_log" DROP CONSTRAINT "fk_audit_log_merchant"`,
    );
    await queryRunner.query(
      `ALTER TABLE "campaign" DROP CONSTRAINT "fk_campaign_merchant"`,
    );
    await queryRunner.query(
      `ALTER TABLE "customer_profile" DROP CONSTRAINT "fk_customer_profile_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "integration_record" DROP CONSTRAINT "fk_integration_record_merchant"`,
    );
    await queryRunner.query(
      `ALTER TABLE "loyalty_membership" DROP CONSTRAINT "fk_loyalty_membership_customer_profile"`,
    );
    await queryRunner.query(
      `ALTER TABLE "loyalty_membership" DROP CONSTRAINT "fk_loyalty_membership_merchant"`,
    );
    await queryRunner.query(
      `ALTER TABLE "loyalty_program" DROP CONSTRAINT "fk_loyalty_program_merchant"`,
    );
    await queryRunner.query(
      `ALTER TABLE "loyalty_transaction" DROP CONSTRAINT "fk_loyalty_transaction_created_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "loyalty_transaction" DROP CONSTRAINT "fk_loyalty_transaction_redemption"`,
    );
    await queryRunner.query(
      `ALTER TABLE "loyalty_transaction" DROP CONSTRAINT "fk_loyalty_transaction_reward"`,
    );
    await queryRunner.query(
      `ALTER TABLE "loyalty_transaction" DROP CONSTRAINT "fk_loyalty_transaction_program"`,
    );
    await queryRunner.query(
      `ALTER TABLE "loyalty_transaction" DROP CONSTRAINT "fk_loyalty_transaction_customer_profile"`,
    );
    await queryRunner.query(
      `ALTER TABLE "loyalty_transaction" DROP CONSTRAINT "fk_loyalty_transaction_membership"`,
    );
    await queryRunner.query(
      `ALTER TABLE "loyalty_transaction" DROP CONSTRAINT "fk_loyalty_transaction_merchant"`,
    );
    await queryRunner.query(
      `ALTER TABLE "merchant_membership" DROP CONSTRAINT "fk_merchant_membership_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "merchant_membership" DROP CONSTRAINT "fk_merchant_membership_merchant"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reward_redemption" DROP CONSTRAINT "fk_reward_redemption_redeemed_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reward_redemption" DROP CONSTRAINT "fk_reward_redemption_verified_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reward_redemption" DROP CONSTRAINT "fk_reward_redemption_requested_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reward_redemption" DROP CONSTRAINT "fk_reward_redemption_reward"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reward_redemption" DROP CONSTRAINT "fk_reward_redemption_membership"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reward_redemption" DROP CONSTRAINT "fk_reward_redemption_merchant"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reward" DROP CONSTRAINT "fk_reward_merchant"`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscription" DROP CONSTRAINT "fk_subscription_merchant"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."ix_audit_log_action_created"`,
    );
    await queryRunner.query(`DROP INDEX "public"."ix_audit_log_actor_created"`);
    await queryRunner.query(
      `DROP INDEX "public"."ix_audit_log_tenant_created"`,
    );
    await queryRunner.query(`DROP TABLE "audit_log"`);
    await queryRunner.query(
      `DROP INDEX "public"."ix_campaign_tenant_status_window"`,
    );
    await queryRunner.query(`DROP TABLE "campaign"`);
    await queryRunner.query(`DROP INDEX "public"."ix_customer_profile_name"`);
    await queryRunner.query(`DROP TABLE "customer_profile"`);
    await queryRunner.query(
      `DROP INDEX "public"."ix_integration_record_tenant_entity"`,
    );
    await queryRunner.query(`DROP TABLE "integration_record"`);
    await queryRunner.query(
      `DROP INDEX "public"."ix_loyalty_membership_merchant_status"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."ix_loyalty_membership_customer"`,
    );
    await queryRunner.query(`DROP TABLE "loyalty_membership"`);
    await queryRunner.query(
      `DROP INDEX "public"."uq_loyalty_program_active_per_merchant"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."ix_loyalty_program_merchant"`,
    );
    await queryRunner.query(`DROP TABLE "loyalty_program"`);
    await queryRunner.query(
      `DROP INDEX "public"."ix_loyalty_transaction_redemption"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."ix_loyalty_transaction_tenant_created"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."ix_loyalty_transaction_tenant_customer_created"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."ix_loyalty_transaction_membership_created"`,
    );
    await queryRunner.query(`DROP TABLE "loyalty_transaction"`);
    await queryRunner.query(
      `DROP INDEX "public"."ix_merchant_membership_merchant_status"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."ix_merchant_membership_user"`,
    );
    await queryRunner.query(`DROP TABLE "merchant_membership"`);
    await queryRunner.query(`DROP INDEX "public"."ix_merchant_created_at"`);
    await queryRunner.query(`DROP INDEX "public"."ix_merchant_status"`);
    await queryRunner.query(`DROP TABLE "merchant"`);
    await queryRunner.query(
      `DROP INDEX "public"."ix_reward_redemption_membership"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."ix_reward_redemption_merchant_reward"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."ix_reward_redemption_tenant_status_created"`,
    );
    await queryRunner.query(`DROP TABLE "reward_redemption"`);
    await queryRunner.query(`DROP INDEX "public"."ix_reward_merchant_created"`);
    await queryRunner.query(`DROP INDEX "public"."ix_reward_merchant_status"`);
    await queryRunner.query(`DROP TABLE "reward"`);
    await queryRunner.query(`DROP TABLE "subscription"`);
    await queryRunner.query(`DROP TABLE "user"`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS prevent_row_mutation()`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS set_updated_at()`);
  }
}
