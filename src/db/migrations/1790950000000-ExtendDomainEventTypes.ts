import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Extends the domain_event_outbox CHECK constraint to include the three new
 * event types required by checklist §12 (future-capability architecture):
 *
 *   - customer.enrolled   — customer joined a merchant loyalty program
 *   - campaign.started    — a campaign transitioned to ACTIVE status
 *   - campaign.ended      — a campaign transitioned to ENDED/ARCHIVED status
 *
 * The previous constraint only allowed:
 *   loyalty.transaction.created, reward.redeemed
 *
 * This migration drops and recreates the CHECK constraint only — the table
 * data and all indices are unchanged.
 */
export class ExtendDomainEventTypes1790950000000 implements MigrationInterface {
  name = "ExtendDomainEventTypes1790950000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop the old event-type constraint.
    // NOTE: PostgreSQL CHECK constraints on plain tables can be dropped without
    // locking the full table when they have an explicit name.
    await queryRunner.query(
      `ALTER TABLE "domain_event_outbox" DROP CONSTRAINT IF EXISTS "ck_domain_event_outbox_event_type"`,
    );

    // The outbox now validates that the event_type is one of the platform's
    // closed set — the same list as DOMAIN_EVENT_TYPES in domain-events.ts.
    // We do NOT use a PostgreSQL ENUM type (cannot be altered inside a
    // transaction block); a CHECK over varchar is safe to extend.
    //
    // Note: we keep the existing "length(btrim(event_type)) > 0" check as the
    // fallback inside the original constraint was just non-empty. The new
    // constraint enumerates all valid values explicitly.
    await queryRunner.query(
      `ALTER TABLE "domain_event_outbox"
         ADD CONSTRAINT "ck_domain_event_outbox_event_type"
         CHECK (event_type IN (
           'customer.enrolled',
           'loyalty.transaction.created',
           'reward.redeemed',
           'campaign.started',
           'campaign.ended'
         ))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore to the original constraint (two event types only).
    await queryRunner.query(
      `ALTER TABLE "domain_event_outbox" DROP CONSTRAINT IF EXISTS "ck_domain_event_outbox_event_type"`,
    );
    await queryRunner.query(
      `ALTER TABLE "domain_event_outbox"
         ADD CONSTRAINT "ck_domain_event_outbox_event_type"
         CHECK (length(btrim(event_type)) > 0)`,
    );
  }
}
