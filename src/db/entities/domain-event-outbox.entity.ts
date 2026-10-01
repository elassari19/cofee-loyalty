import { EntitySchema } from "typeorm";
import {
  DOMAIN_EVENT_STATUSES,
  sqlEnum,
  type DomainEventStatus,
} from "./enums";
import { MerchantEntity } from "./merchant.entity";

/**
 * Transactional outbox (checklist §8 bullet 12 — "publish … only after commit
 * … via a durable outbox").
 *
 * A loyalty transaction is not an event that some other system can miss: the
 * balance changed here, so the notification/webhook/analytics consumer must
 * eventually see it. Publishing straight from the request path loses the
 * event whenever the process dies between commit and publish, and publishing
 * *before* commit announces a change that may still roll back.
 *
 * So the row is inserted inside the same database transaction as the ledger
 * entry (`enqueueDomainEvent`). Commit makes both durable; rollback removes
 * both. A dispatcher then claims pending rows with `FOR UPDATE SKIP LOCKED`,
 * runs the handlers, and records the outcome — an unreadable handler never
 * affects the customer's balance, and a crashed dispatcher simply picks the
 * row up on its next pass.
 *
 * Payloads hold ids and numbers only — no names, emails or tokens. Events
 * leave the tenant boundary later (webhooks), so they carry the minimum.
 */
export interface DomainEventOutbox {
  id: string;
  merchantId: string;
  /** Closed value domain — see `DOMAIN_EVENT_TYPES` in `@/lib/domain-events`. */
  eventType: string;
  /** Kind of row `aggregateId` points at, e.g. `loyalty_transaction`. */
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  /** Business key: replaying the same write must not enqueue twice. */
  idempotencyKey: string;
  status: DomainEventStatus;
  attempts: number;
  /** Dispatchers only claim rows whose time has come (backoff). */
  availableAt: Date;
  lastError: string | null;
  createdAt: Date;
  deliveredAt: Date | null;
}

export const DomainEventOutboxEntity = new EntitySchema<DomainEventOutbox>({
  name: "domain_event_outbox",
  tableName: "domain_event_outbox",
  columns: {
    id: { type: "uuid", primary: true, generated: "uuid" },
    merchantId: { type: "uuid", name: "merchant_id" },
    eventType: { type: "varchar", length: 80, name: "event_type" },
    aggregateType: { type: "varchar", length: 60, name: "aggregate_type" },
    aggregateId: { type: "varchar", length: 64, name: "aggregate_id" },
    payload: { type: "jsonb", default: "{}" },
    idempotencyKey: { type: "varchar", length: 200, name: "idempotency_key" },
    status: { type: "varchar", length: 20, default: "PENDING" },
    attempts: { type: "int", default: 0 },
    availableAt: {
      type: "timestamptz",
      name: "available_at",
      default: () => "CURRENT_TIMESTAMP",
    },
    lastError: {
      type: "varchar",
      length: 500,
      name: "last_error",
      nullable: true,
    },
    createdAt: {
      type: "timestamptz",
      name: "created_at",
      default: () => "CURRENT_TIMESTAMP",
    },
    deliveredAt: {
      type: "timestamptz",
      name: "delivered_at",
      nullable: true,
    },
  },
  uniques: [
    {
      name: "uq_domain_event_outbox_merchant_idempotency",
      columns: ["merchantId", "idempotencyKey"],
    },
  ],
  checks: [
    {
      name: "ck_domain_event_outbox_status",
      expression: `status IN (${sqlEnum(DOMAIN_EVENT_STATUSES)})`,
    },
    {
      name: "ck_domain_event_outbox_attempts",
      expression: "attempts >= 0",
    },
    {
      name: "ck_domain_event_outbox_event_type",
      expression: "length(btrim(event_type)) > 0",
    },
  ],
  foreignKeys: [
    {
      name: "fk_domain_event_outbox_merchant",
      target: MerchantEntity,
      columnNames: ["merchant_id"],
      referencedColumnNames: ["id"],
      onDelete: "RESTRICT",
    },
  ],
  indices: [
    {
      name: "ix_domain_event_outbox_claim",
      columns: ["status", "availableAt"],
    },
    {
      name: "ix_domain_event_outbox_merchant_created",
      columns: ["merchantId", "createdAt"],
    },
    {
      name: "ix_domain_event_outbox_aggregate",
      columns: ["merchantId", "aggregateType", "aggregateId"],
    },
  ],
});
