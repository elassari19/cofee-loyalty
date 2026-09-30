import { EntitySchema } from "typeorm";
import {
  INTEGRATION_ENTITY_TYPES,
  sqlEnum,
  type IntegrationEntityType,
} from "./enums";
import { MerchantEntity } from "./merchant.entity";

/**
 * Provider identifiers kept *outside* the core entities (checklist §4
 * "integration records", §12 "Keep provider identifiers separate from
 * canonical platform IDs").
 *
 * A POS, Wallet or messaging provider's id is only ever a pointer: it names
 * a canonical record (`entity_type` + `entity_id`) inside one tenant, and is
 * unique per provider per merchant. Core tables — customer, membership,
 * transaction — never grow provider-specific columns, so a future adapter is
 * a new row here plus code, not a schema rewrite.
 *
 * `metadata` carries provider-specific payload that is *not* identity.
 */
export interface IntegrationRecord {
  id: string;
  merchantId: string;
  provider: string;
  entityType: IntegrationEntityType;
  entityId: string;
  externalId: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export const IntegrationRecordEntity = new EntitySchema<IntegrationRecord>({
  name: "integration_record",
  tableName: "integration_record",
  columns: {
    id: { type: "uuid", primary: true, generated: "uuid" },
    merchantId: { type: "uuid", name: "merchant_id" },
    provider: { type: "varchar", length: 60 },
    entityType: { type: "varchar", length: 40, name: "entity_type" },
    entityId: { type: "varchar", length: 64, name: "entity_id" },
    externalId: { type: "varchar", length: 200, name: "external_id" },
    metadata: { type: "jsonb", default: "{}" },
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
    {
      name: "uq_integration_record_external",
      columns: ["provider", "merchantId", "externalId"],
    },
  ],
  checks: [
    {
      name: "ck_integration_record_entity_type",
      expression: `entity_type IN (${sqlEnum(INTEGRATION_ENTITY_TYPES)})`,
    },
    {
      name: "ck_integration_record_external_id",
      expression: "length(btrim(external_id)) > 0",
    },
  ],
  foreignKeys: [
    {
      name: "fk_integration_record_merchant",
      target: MerchantEntity,
      columnNames: ["merchant_id"],
      referencedColumnNames: ["id"],
      onDelete: "RESTRICT",
    },
  ],
  indices: [
    {
      name: "ix_integration_record_tenant_entity",
      columns: ["merchantId", "entityType", "entityId"],
    },
  ],
});
