// Better Auth's own tables (ADR 0001): `session`, `account`, `verification`.
// The source of truth is `src/db/entities/auth-schemas.ts` — regenerate with
// `pnpm db:migrate:generate` rather than editing these statements by hand.
//
// `import type` is required: TypeORM loads migration files with a native
// dynamic import at DataSource init, where a value import of these type-only
// symbols would fail at runtime. Future generated migrations need the same
// one-line change (docs/database.md).
import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddAuthTables1790793203255 implements MigrationInterface {
  name = "AddAuthTables1790793203255";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "session" ("id" character varying NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "token" character varying NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "ip_address" text, "user_agent" text, "user_id" text NOT NULL, CONSTRAINT "uq_session_token" UNIQUE ("token"), CONSTRAINT "PK_f55da76ac1c3ac420f444d2ff11" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "session_user_id_idx" ON "session" ("user_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "account" ("id" character varying NOT NULL, "account_id" text NOT NULL, "provider_id" text NOT NULL, "user_id" text NOT NULL, "access_token" text, "refresh_token" text, "id_token" text, "access_token_expires_at" TIMESTAMP WITH TIME ZONE, "refresh_token_expires_at" TIMESTAMP WITH TIME ZONE, "scope" text, "password" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_54115ee388cdb6d86bb4bf5b2ea" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "account_user_id_idx" ON "account" ("user_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "verification" ("id" character varying NOT NULL, "identifier" text NOT NULL, "value" text NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_f7e3a90ca384e71d6e2e93bb340" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "verification_identifier_idx" ON "verification" ("identifier") `,
    );
    await queryRunner.query(
      `ALTER TABLE "session" ADD CONSTRAINT "fk_session_user" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "account" ADD CONSTRAINT "fk_account_user" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "account" DROP CONSTRAINT "fk_account_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "session" DROP CONSTRAINT "fk_session_user"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."verification_identifier_idx"`,
    );
    await queryRunner.query(`DROP TABLE "verification"`);
    await queryRunner.query(`DROP INDEX "public"."account_user_id_idx"`);
    await queryRunner.query(`DROP TABLE "account"`);
    await queryRunner.query(`DROP INDEX "public"."session_user_id_idx"`);
    await queryRunner.query(`DROP TABLE "session"`);
  }
}
