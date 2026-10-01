import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddDomainEventOutbox1790879124476 implements MigrationInterface {
  name = "AddDomainEventOutbox1790879124476";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "domain_event_outbox" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "merchant_id" uuid NOT NULL, "event_type" character varying(80) NOT NULL, "aggregate_type" character varying(60) NOT NULL, "aggregate_id" character varying(64) NOT NULL, "payload" jsonb NOT NULL DEFAULT '{}', "idempotency_key" character varying(200) NOT NULL, "status" character varying(20) NOT NULL DEFAULT 'PENDING', "attempts" integer NOT NULL DEFAULT '0', "available_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "last_error" character varying(500), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "delivered_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "uq_domain_event_outbox_merchant_idempotency" UNIQUE ("merchant_id", "idempotency_key"), CONSTRAINT "ck_domain_event_outbox_status" CHECK (status IN ('PENDING', 'DELIVERED', 'FAILED')), CONSTRAINT "ck_domain_event_outbox_attempts" CHECK (attempts >= 0), CONSTRAINT "ck_domain_event_outbox_event_type" CHECK (length(btrim(event_type)) > 0), CONSTRAINT "PK_a51303e3f561e3d80c0c9ce9a07" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_domain_event_outbox_claim" ON "domain_event_outbox" ("status", "available_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_domain_event_outbox_merchant_created" ON "domain_event_outbox" ("merchant_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_domain_event_outbox_aggregate" ON "domain_event_outbox" ("merchant_id", "aggregate_type", "aggregate_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "domain_event_outbox" ADD CONSTRAINT "fk_domain_event_outbox_merchant" FOREIGN KEY ("merchant_id") REFERENCES "merchant"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "domain_event_outbox" DROP CONSTRAINT "fk_domain_event_outbox_merchant"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."ix_domain_event_outbox_aggregate"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."ix_domain_event_outbox_merchant_created"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."ix_domain_event_outbox_claim"`,
    );
    await queryRunner.query(`DROP TABLE "domain_event_outbox"`);
  }
}
