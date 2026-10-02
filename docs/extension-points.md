# Extension Points — Future-Capability Architecture

> **Checklist §12** — "Document which extension points are implemented in
> Phase 1 and which adapters/services remain future work."
>
> This document is the authoritative record. Every team adding a future
> integration must update it.

---

## TL;DR — What is implemented vs. future

| Capability                | Extension point                                   | Phase 1 status    |
| ------------------------- | ------------------------------------------------- | ----------------- |
| Domain events / outbox    | Full durable outbox, 5 event types                | ✅ Implemented    |
| Wallet (Apple / Google)   | `WalletAdapter` interface + stub                  | 🔲 Interface only |
| POS integrations          | `PosAdapter` interface + stub                     | 🔲 Interface only |
| WhatsApp / SMS / Push     | `NotificationChannelAdapter` + stub               | 🔲 Interface only |
| Gamification              | `GamificationMechanicEvaluator` + stub dispatcher | 🔲 Interface only |
| AI / predictive analytics | `AnalyticsProvider` + governance contracts        | 🔲 Interface only |
| Provider identity mapping | `integration_record` table                        | ✅ Implemented    |
| External POS ref dedup    | `loyalty_transaction.external_ref` UNIQUE         | ✅ Implemented    |
| Subscription architecture | `subscription` table + plan limits                | ✅ Implemented    |
| Email (transactional)     | `EmailProvider` adapter + local stub              | ✅ Implemented    |

---

## 1. Domain Events & Outbox

**What is built:**

- `domain_event_outbox` table with durable write-ahead delivery.
- `enqueueDomainEvent(em, input)` — write inside the same transaction as the
  business change (never announced before commit).
- `dispatchOutbox()` — `FOR UPDATE SKIP LOCKED` claim + handler dispatch.
- `startOutboxDispatcher(options)` — periodic background pass.
- `registerDomainEventHandler(eventType, handler)` — subscribe/unsubscribe.

**Event types (Phase 1):**

| Event type                    | Payload                                  | Fired by                   |
| ----------------------------- | ---------------------------------------- | -------------------------- |
| `customer.enrolled`           | `{ membershipId, loyaltyType }`          | Customer enrollment flow   |
| `loyalty.transaction.created` | `{ delta, unit, type, membershipId }`    | Ledger `appendLedgerEntry` |
| `reward.redeemed`             | `{ redemptionId, rewardId, pointsUsed }` | Redemption complete action |
| `campaign.started`            | `{ campaignId, audienceType }`           | Campaign status transition |
| `campaign.ended`              | `{ campaignId }`                         | Campaign status transition |

**Adding a new event type:**

1. Add the string to `DOMAIN_EVENT_TYPES` in `src/lib/domain-events.ts`.
2. Run the migration to update the `ck_domain_event_outbox_event_type` CHECK.
3. Add a `registerDomainEventHandler` call for any consumer.

**Constraints:**

- Event handlers MUST NOT write loyalty balances or redemptions.
- Payloads carry tenant context (`merchantId`) and stable IDs — no raw PII.
- Payloads are versioned by the event type; breaking changes require a new type.

---

## 2. Integration Records (`integration_record`)

**What is built:**

The `integration_record` table maps provider identifiers to canonical platform
identities — keeping external IDs out of the core entity tables.

```
integration_record
├── merchantId        (tenant scope)
├── provider          (e.g. "square", "apple_wallet", "google_wallet")
├── entityType        ("merchant" | "customer_profile" | "loyalty_membership")
├── entityId          (platform canonical ID)
├── externalId        (provider's own ID)
└── metadata          (opaque provider payload)
```

**Adding a new integration entity type:**

1. Add the value to `INTEGRATION_ENTITY_TYPES` in `src/db/entities/enums.ts`.
2. Migrate the `ck_integration_record_entity_type` CHECK constraint.

**Constraints:**

- `UNIQUE (provider, merchantId, externalId)` prevents duplicate mappings.
- Core tables (`customer_profile`, `loyalty_membership`, `loyalty_transaction`)
  never gain provider-specific columns.

---

## 3. Wallet Adapters (Apple Wallet / Google Wallet)

**What is built:**

- `WalletAdapter` interface (`src/integrations/wallet/index.ts`)
- `registerWalletAdapter(adapter)` / `getWalletAdapter(provider)` registry
- `StubWalletAdapter` for both `apple` and `google` providers (no-op)
- `WalletPassData` — the data contract the adapter receives (no PII, no DB access)

**What is NOT built (future work):**

- Apple Pass Type ID, signing certificates, `.pkpass` generation
- Google Pay API credentials, JWT signing, Google Wallet Objects API
- Device push notifications for pass updates
- Pass update handler (called from domain event handler on `loyalty.transaction.created`)

**Integration pattern for future implementors:**

```typescript
// 1. Create a concrete adapter
import {
  type WalletAdapter,
  registerWalletAdapter,
} from "@/integrations/wallet";

class AppleWalletAdapter implements WalletAdapter {
  readonly provider = "apple" as const;
  // ... implement issuePass, updatePass, revokePass
}

// 2. Register during app bootstrap (e.g. src/lib/startup.ts)
registerWalletAdapter(new AppleWalletAdapter(config));

// 3. Handle the domain event to push balance updates
registerDomainEventHandler("loyalty.transaction.created", async (event) => {
  const adapter = getWalletAdapter("apple");
  if (!adapter) return;
  // look up providerPassId from integration_record
  // call adapter.updatePass(providerPassId, data)
});
```

**Invariants:**

- Wallet-specific logic MUST NOT appear in `loyalty_transaction`, `reward`,
  `customer_profile`, or `loyalty_membership` entities.
- The stable link between a pass and the platform is always `loyaltyMembershipId`
  stored in `integration_record.entityId`.

---

## 4. POS Adapters

**What is built:**

- `PosAdapter` interface (`src/integrations/pos/index.ts`)
- `CanonicalPosTransaction` — provider-neutral transaction struct
- `ReconciliationReport` — contract for reconciliation jobs
- `StubPosAdapter` — validates required fields, no real provider
- `registerPosAdapter(adapter)` / `getPosAdapter(provider)` registry

**What is NOT built (future work):**

- Square, Toast, Lightspeed, or generic POS credentials / webhook registration
- Reconciliation job (cron / queue worker)
- POS customer-to-platform-customer linking UI
- POS-specific admin configuration screen

**Integration pattern for future implementors:**

```typescript
// 1. Create a concrete adapter
class SquarePosAdapter implements PosAdapter {
  readonly provider = "square" as const;
  // ... implement parseInboundEvent, resolveCustomer, fetchReconciliationWindow
}

// 2. Register during bootstrap
registerPosAdapter(new SquarePosAdapter(squareConfig));

// 3. In the POS webhook route handler:
//    a. Verify provider webhook signature (adapter responsibility)
//    b. Parse → CanonicalPosTransaction
//    c. resolveCustomer → customerProfileId (null = skip)
//    d. Call loyalty service earnPoints/earnStamps with externalRef
//    e. The UNIQUE constraint on external_ref handles duplicates idempotently
```

**Invariants:**

- POS adapters MUST NOT write to `loyalty_transaction` directly.
- Payment card data MUST be stripped in `parseInboundEvent` before returning.
- `externalRef` must be the provider's own stable transaction ID (not an order ID
  that can repeat across refunds).

---

## 5. Notification Adapters (WhatsApp / SMS / Push)

**What is built:**

- `NotificationChannelAdapter` interface (`src/integrations/notifications/index.ts`)
- `NotificationMessage` — tenant-scoped, template-keyed, no raw PII
- `ChannelConsent` — per-customer/channel consent model
- `DeliveryRecord` — status callback contract (no message body in audit)
- `isMarketingNotification(kind)` — consent gate helper
- `StubNotificationAdapter` for all channels (deny-by-default)
- `registerNotificationAdapter(adapter)` / `getNotificationAdapter(channel)` registry

**What is NOT built (future work):**

- WhatsApp Business API credentials / number registration
- SMS provider (Twilio, AWS SNS, etc.) credentials
- Push provider (FCM, APNs) credentials
- Consent storage table (`channel_consent` entity)
- Message template storage and rendering engine
- Bulk-send orchestration / rate-limit queue
- Unsubscribe handling UI

**Consent invariants:**

- `canSend()` MUST be called before `send()`.
- Marketing messages (`campaign.started`, `campaign.offer`) require
  `consent.marketing === true`.
- Customer contact details (phone, WhatsApp number) MUST NOT appear in
  `NotificationMessage.payload` — the adapter resolves contact from its own
  scoped integration config.
- Opt-out state is stored per `(customerProfileId, merchantId, channel)`.

---

## 6. Gamification Boundary

**What is built:**

- `GamificationMechanic` — versioned mechanic definition
- `GamificationMechanicEvaluator` interface
- `GamificationDispatcher` interface
- `dispatchGamificationEvent(event)` — safe wrapper (never throws)
- `StubGamificationDispatcher` — returns 0 awards (Phase 1)
- `registerGamificationEvaluator(evaluator)` / `setGamificationDispatcher(d)` registry

**What is NOT built (future work):**

- `gamification_mechanic` database table and migration
- `gamification_award` audit table
- Badge image storage
- Leaderboard storage and API
- Challenge progress persistence
- Streak tracking
- Mechanic admin configuration UI
- Anti-abuse rate-limit per customer per mechanic

**Invariants:**

- Evaluators MUST return a decision (`award: true | false`) — they MUST NOT
  call the loyalty service directly.
- The dispatcher calls `earnPoints` / `earnStamps` (not `appendLedgerEntry`)
  using the mechanic's `idempotencyKey` to prevent double-award.
- A mechanic can only award value in the merchant's active program unit.
- Cross-merchant mechanic definitions are forbidden.

---

## 7. AI / Predictive Analytics Governance

**What is built:**

- `AnalyticsInsight` — advisory-only insight struct (always `source: "stub"` in Phase 1)
- `TenantAnalyticsExport` — minimized, pseudonymous, tenant-scoped data contract
- `AnalyticsAccessRecord` — every AI data access must produce one
- `CrossTenantAuthorizationRecord` — contract for any future cross-tenant use
- `AnalyticsProvider` interface
- `stubAnalyticsProvider` — returns empty exports and zero-confidence insights
- `setAnalyticsProvider(provider)` / `getAnalyticsProvider()` registry

**What is NOT built (future work):**

- Model training pipelines
- Vector databases or embedding stores
- Recommendation engine
- Predictive churn scoring
- AI-generated campaign content
- Consent storage for AI data use
- Cross-tenant authorization UI

**Hard invariants (enforced architecturally):**

- AI modules MUST NOT write to `loyalty_transaction`, `reward_redemption`,
  or `campaign` rows. All resulting actions pass through existing authorization
  and business-rule validation paths.
- `AnalyticsInsight` is advisory. The UI must label it as a recommendation,
  not a certainty.
- No cross-tenant inference without a `CrossTenantAuthorizationRecord` signed
  by a Super Admin with an explicit legal basis.
- Every data access creates an `AnalyticsAccessRecord` in the audit log.
- Customer data in exports is pseudonymized (per-export mapping, one-way).

---

## 8. Versioned API Contracts

**Phase 1 status:** All existing API routes are version-prefixed at `/api/`
(implicitly v1). Explicit version headers are future work.

**Pattern reserved for future versioning:**

```
/api/v1/merchants/:id
/api/v2/merchants/:id   ← breaking change introduces a new prefix
```

**Event payload versioning:** Event types are versioned by name
(`loyalty.transaction.created.v2` would be a new type string, not an edit to
the existing payload).

**Webhook consumer authentication:** Future external webhook consumers must
authenticate with a per-merchant signing secret. The `integration_record`
table has a `metadata` column where the secret reference (not the secret
itself) is stored.

---

## Change log

| Date    | Change                                            | Author        |
| ------- | ------------------------------------------------- | ------------- |
| Phase 1 | Initial documentation of all §12 extension points | Platform team |
