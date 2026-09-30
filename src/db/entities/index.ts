/**
 * Single registration point for every `EntitySchema` in the data foundation
 * (checklist §4).
 *
 * `data-source.ts` passes this list to TypeORM explicitly instead of using an
 * `entities` glob: a glob makes TypeORM `import()` the files itself with a
 * native dynamic import, which bypasses the active loader's resolver (Vite in
 * Vitest, SWC in Next.js) and breaks on extensionless relative imports.
 * A static barrel resolves through whatever runtime loaded the data source,
 * and `index.test.ts` fails if a file is added here without being registered.
 *
 * When adding an entity: create `*.entity.ts`, export its schema from this
 * file — the guard test enforces the rest. The one exception is Better Auth's
 * generated tables (`auth-schemas.ts`), which are registered as a group and
 * accounted for explicitly by the same test.
 */
import { AuditLogEntity } from "./audit-log.entity";
import { AUTH_ENTITY_SCHEMAS } from "./auth-schemas";
import { CampaignEntity } from "./campaign.entity";
import { CustomerProfileEntity } from "./customer-profile.entity";
import { IntegrationRecordEntity } from "./integration-record.entity";
import { LoyaltyMembershipEntity } from "./loyalty-membership.entity";
import { LoyaltyProgramEntity } from "./loyalty-program.entity";
import { LoyaltyTransactionEntity } from "./loyalty-transaction.entity";
import { MerchantEntity } from "./merchant.entity";
import { MerchantMembershipEntity } from "./merchant-membership.entity";
import { RewardEntity } from "./reward.entity";
import { RewardRedemptionEntity } from "./reward-redemption.entity";
import { SubscriptionEntity } from "./subscription.entity";
import { UserEntity } from "./user.entity";

export const ENTITY_SCHEMAS = [
  AuditLogEntity,
  ...AUTH_ENTITY_SCHEMAS,
  CampaignEntity,
  CustomerProfileEntity,
  IntegrationRecordEntity,
  LoyaltyMembershipEntity,
  LoyaltyProgramEntity,
  LoyaltyTransactionEntity,
  MerchantEntity,
  MerchantMembershipEntity,
  RewardEntity,
  RewardRedemptionEntity,
  SubscriptionEntity,
  UserEntity,
];
