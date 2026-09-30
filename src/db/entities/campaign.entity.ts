import { EntitySchema } from "typeorm";
import {
  CAMPAIGN_AUDIENCES,
  CAMPAIGN_STATUSES,
  sqlEnum,
  type CampaignAudience,
  type CampaignStatus,
} from "./enums";
import { MerchantEntity } from "./merchant.entity";

/**
 * A scheduled merchant offer (PRD §26/§27).
 *
 * `start_at`/`end_at` are absolute instants (`timestamptz`); evaluating
 * whether a campaign is live *in the merchant's timezone* is application
 * logic (checklist §10), using `merchant.timezone`. The CHECK on ordering
 * makes an inverted schedule impossible, and the composite index covers the
 * tenant-scoped "what is running now" lookup.
 *
 * `configuration` carries the rule (e.g. a points multiplier or a bonus) and
 * stays separate from the loyalty ledger: campaigns propose effects, only
 * the loyalty service may write entries (checklist §12).
 */
export interface Campaign {
  id: string;
  merchantId: string;
  name: string;
  description: string | null;
  terms: string | null;
  imageUrl: string | null;
  audience: CampaignAudience;
  configuration: Record<string, unknown>;
  startAt: Date;
  endAt: Date;
  status: CampaignStatus;
  createdAt: Date;
  updatedAt: Date;
}

export const CampaignEntity = new EntitySchema<Campaign>({
  name: "campaign",
  tableName: "campaign",
  columns: {
    id: { type: "uuid", primary: true, generated: "uuid" },
    merchantId: { type: "uuid", name: "merchant_id" },
    name: { type: "varchar", length: 200 },
    description: { type: "text", nullable: true },
    terms: { type: "text", nullable: true },
    imageUrl: {
      type: "varchar",
      length: 500,
      name: "image_url",
      nullable: true,
    },
    audience: { type: "varchar", length: 40, default: "ALL_CUSTOMERS" },
    configuration: { type: "jsonb", default: "{}" },
    startAt: { type: "timestamptz", name: "start_at" },
    endAt: { type: "timestamptz", name: "end_at" },
    status: { type: "varchar", length: 20, default: "DRAFT" },
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
  checks: [
    {
      name: "ck_campaign_audience",
      expression: `audience IN (${sqlEnum(CAMPAIGN_AUDIENCES)})`,
    },
    {
      name: "ck_campaign_status",
      expression: `status IN (${sqlEnum(CAMPAIGN_STATUSES)})`,
    },
    { name: "ck_campaign_window", expression: "end_at > start_at" },
  ],
  foreignKeys: [
    {
      name: "fk_campaign_merchant",
      target: MerchantEntity,
      columnNames: ["merchant_id"],
      referencedColumnNames: ["id"],
      onDelete: "RESTRICT",
    },
  ],
  indices: [
    {
      name: "ix_campaign_tenant_status_window",
      columns: ["merchantId", "status", "startAt", "endAt"],
    },
  ],
});
