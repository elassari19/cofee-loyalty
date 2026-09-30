import { EntitySchema } from "typeorm";
import {
  SUBSCRIPTION_PLANS,
  SUBSCRIPTION_STATUSES,
  sqlEnum,
  type SubscriptionPlan,
  type SubscriptionStatus,
} from "./enums";
import { MerchantEntity } from "./merchant.entity";

/**
 * The merchant's plan and limits (PRD §32 — "Subscription-ready
 * architecture", no billing in Phase 1).
 *
 * `UNIQUE (merchant_id)` keeps exactly one subscription row per tenant, and
 * `provider`/`provider_reference` are reserved for a future billing
 * integration: a payment provider's ids are stored *here*, next to the
 * tenant that owns them, never as the platform's own identity
 * (checklist §12).
 */
export interface Subscription {
  id: string;
  merchantId: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  limits: Record<string, unknown>;
  provider: string | null;
  providerReference: string | null;
  startedAt: Date;
  renewsAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const SubscriptionEntity = new EntitySchema<Subscription>({
  name: "subscription",
  tableName: "subscription",
  columns: {
    id: { type: "uuid", primary: true, generated: "uuid" },
    merchantId: { type: "uuid", name: "merchant_id" },
    plan: { type: "varchar", length: 20, default: "FREE" },
    status: { type: "varchar", length: 20, default: "active" },
    limits: { type: "jsonb", default: "{}" },
    provider: { type: "varchar", length: 60, nullable: true },
    providerReference: {
      type: "varchar",
      length: 200,
      name: "provider_reference",
      nullable: true,
    },
    startedAt: {
      type: "timestamptz",
      name: "started_at",
      default: () => "CURRENT_TIMESTAMP",
    },
    renewsAt: { type: "timestamptz", name: "renews_at", nullable: true },
    createdAt: {
      type: "timestamptz",
      name: "created_at",
      default: () => "CURRENT_TIMESTAMP",
    },
    updatedAt: {
      type: "timestamptz",
      name: "updated_at",
      default: () => "CURRENT_TIMESTAMP",
    },
  },
  uniques: [
    { name: "uq_subscription_merchant", columns: ["merchantId"] },
    {
      name: "uq_subscription_provider_reference",
      columns: ["provider", "providerReference"],
    },
  ],
  checks: [
    {
      name: "ck_subscription_plan",
      expression: `plan IN (${sqlEnum(SUBSCRIPTION_PLANS)})`,
    },
    {
      name: "ck_subscription_status",
      expression: `status IN (${sqlEnum(SUBSCRIPTION_STATUSES)})`,
    },
    {
      name: "ck_subscription_renews_after_start",
      expression: "renews_at IS NULL OR renews_at > started_at",
    },
  ],
  foreignKeys: [
    {
      name: "fk_subscription_merchant",
      target: MerchantEntity,
      columnNames: ["merchant_id"],
      referencedColumnNames: ["id"],
      onDelete: "RESTRICT",
    },
  ],
});
