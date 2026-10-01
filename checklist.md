# Implementation Checklist — Multi-Tenant Loyalty SaaS MVP

This checklist turns the PRD into sequenced engineering work. Complete the Phase 1 product loop and security gates before release. Wallets, POS integrations, WhatsApp, SMS, AI, advanced gamification, and predictive analytics are future capabilities: build their architectural extension points in Phase 1, but do not implement those products in the MVP.

## 1. Stack and Working Agreements

- [x] Use TypeScript and Next.js App Router for the web application and server-side API routes.
- [x] Use shadcn/ui components with Tailwind CSS for the interface; keep shared design tokens and accessible interaction patterns consistent.
- [x] Use PostgreSQL as the system of record, TypeORM for persistence and migrations, and Redis for narrowly scoped cache, rate-limit, and asynchronous-job use cases.
- [x] Keep database access on the Node.js runtime; do not route TypeORM-backed operations through Edge runtimes.
- [x] Select and document a maintained authentication solution that works with the chosen TypeORM/PostgreSQL design before implementing login. Do not invent password or session cryptography.
- [x] Choose and pin a supported Node.js LTS version and one package manager (recommended: pnpm); commit the lockfile.
- [x] Install dependencies and UI components through the package-manager or official tool CLI. Do not manually add installed packages to `package.json` or copy component source from unverified sources.
- [x] Use CLI commands for setup and installation, for example `pnpm add <package>`, `pnpm add -D <package>`, and `pnpm dlx shadcn@latest add <component>`; review generated files and lockfile changes.
- [x] Add documented CLI scripts for local development, linting, type-checking, tests, builds, TypeORM migrations, and seed data.
- [x] Keep secrets in environment variables or a secrets manager; provide a safe `.env.example` with names and non-secret placeholders only.

**Done when:** A clean checkout can install dependencies using the documented CLI workflow, start the app and local services, run migrations, and execute validation scripts.

## 2. Project Foundation and Local Services

- [x] Establish a maintainable feature-oriented structure for app routes, UI components, domain logic, persistence, authorization, integrations, and tests.
- [x] Add local PostgreSQL and Redis services using a documented Docker Compose configuration or equivalent developer setup.
- [x] Add health checks for the application, PostgreSQL, and Redis; fail clearly when required services are unavailable.
- [x] Add structured server logging with request/correlation IDs and redact passwords, tokens, redemption codes, and personal data.
- [x] Add centralized error handling that returns safe, consistent API errors without exposing stack traces or SQL details.
- [x] Add environment validation at startup and fail fast on missing or malformed required configuration.
- [x] Configure formatting, linting, TypeScript strictness, and CI checks.
- [x] Add a minimal automated smoke test for application startup and database connectivity.

**Done when:** A new developer can follow the setup documentation to run the app and checks locally without undocumented manual steps.

## 3. Product Design and Navigation

- [x] Define role-aware route groups for platform administrators, merchant owners/managers, staff, and customers.
- [x] Build responsive application shells and navigation using shadcn/ui; ensure keyboard access, focus states, labels, loading, empty, and error states.
- [x] Keep pages focused on operational tasks: dashboard, customers, loyalty program, transactions, rewards, campaigns, staff, analytics, and business settings.
- [x] Create shared form, table, dialog, toast, and confirmation patterns.
- [x] Ensure destructive or value-affecting operations require an explicit confirmation and give a clear result.
- [x] Do not rely on hidden navigation or frontend checks as authorization; protect every server operation independently.

**Done when:** Each role sees an appropriate usable interface, and restricted server routes remain inaccessible even when called directly.

## 4. PostgreSQL and TypeORM Data Foundation

- [x] Design entities and relationships for users, customer profiles, merchants, merchant memberships, loyalty programs, loyalty memberships, ledger transactions, rewards, redemptions, campaigns, audit logs, subscriptions, and integration records.
- [x] Keep platform user identity separate from merchant-specific membership; allow one customer identity to join multiple merchants.
- [x] Add an explicit `merchant_id`/tenant relationship to every merchant-owned record and index tenant-scoped lookup paths.
- [x] Add database constraints for unique emails, membership uniqueness, valid enum/state values, and required relationships.
- [x] Model points and stamps as immutable ledger entries. Correct mistakes with reversing/adjustment entries rather than editing history.
- [x] Define how balances are read: derive from ledger or maintain a transactionally updated projection, with reconciliation tests proving it matches the ledger.
- [x] Add TypeORM migrations for every schema change. Disable schema synchronization outside disposable local experiments; never use it as production migration strategy.
- [x] Add transaction boundaries and locking/concurrency strategy for earn, adjustment, and redemption operations.
- [x] Add seeded development data through repeatable CLI scripts; never seed production with default credentials.
- [x] Document backup, restore, and migration rollback/recovery procedures.

**Done when:** Migrations build the database from empty state, tenant-owned records cannot be created without a tenant, and ledger history remains auditable.

## 5. Authentication, Permissions, and Tenant Isolation

- [x] Implement registration, login, logout, password reset, email verification, and secure session expiration/invalidation.
- [x] Hash passwords using the selected authentication library's supported secure algorithm; never log credentials or reset tokens.
- [x] Define roles and capability permissions for `SUPER_ADMIN`, merchant owner, manager, staff, and customer.
- [x] Implement reusable server-side authorization checks for permissions and resource ownership.
- [x] Derive active merchant/tenant context from the authenticated session and membership; do not trust a frontend-supplied merchant ID as proof of access.
- [x] Scope every read and write query to the authenticated user's tenant and required resource relationship.
- [ ] Add rate limits for login, registration, password reset, QR/token resolution, and redemption-code attempts; use Redis only where appropriate and define safe behavior when it is unavailable.
- [ ] Add audit events for authentication and sensitive role, merchant, customer, loyalty, and redemption actions.
- [x] Write automated cross-tenant authorization tests for customers, balances, transactions, rewards, redemptions, staff, campaigns, analytics, and exports.
- [x] Test privilege escalation attempts, suspended users/merchants, expired sessions, and unauthenticated direct API requests.

**Done when:** A user from Merchant A cannot read or mutate Merchant B data through any API or UI route, and role restrictions are enforced server-side.

## 6. Merchant Onboarding and Loyalty Configuration

- [x] Implement merchant registration and business profile setup, including name, category, contact details, address, currency, timezone, and status.
- [x] Guide the owner through selecting exactly one loyalty model: points or stamps.
- [x] Implement points configuration for earning rules, rounding, minimum purchase, expiration policy, and redemption thresholds.
- [x] Implement stamp configuration for qualifying purchases, required stamps, expiration, and maximum stamps per transaction.
- [x] Validate configuration on the server and version rule changes so historical ledger entries retain the rule context used when created.
- [x] Allow the owner to create an initial reward and preview the customer-facing program.
- [x] Generate a merchant join URL and QR code that contains no personal or sensitive customer information.
- [x] Add onboarding progress, validation errors, and a way to safely resume incomplete setup.

**Done when:** A merchant can create a business, activate one correctly configured loyalty program, create a reward, and display a join QR code.

## 7. Customer Enrollment and Loyalty Identity

- [x] Implement customer account registration from a merchant join URL and authenticate the customer securely.
- [x] Create or reuse the platform customer identity, then create a unique merchant loyalty membership without duplicating the customer profile.
- [x] Issue an opaque, revocable customer identifier/token for staff lookup; ensure the QR payload contains no direct personal information.
- [x] Prevent duplicate membership creation and handle repeated scans/requests idempotently.
- [x] Show the joined merchant, loyalty type, current balance/progress, available rewards, activity, offers, and profile.
- [x] Support customer profile updates and account/session security flows.
- [x] Verify one customer can join more than one merchant while keeping each membership and balance isolated.

**Done when:** A customer can join through QR, receives a safe loyalty identity, and sees only their own membership data.

## 8. Loyalty Ledger and Staff Transactions

- [x] Implement a server-side loyalty service as the only authority for earning, adjustment, reversal, expiry, and redemption of loyalty value.
- [x] Add transaction types for points earned/adjusted/redeemed and stamps earned/adjusted/redeemed, with actor, tenant, source, reason, timestamp, and relevant purchase reference.
- [x] Calculate points/stamps from the merchant's active server-side rules; validate positive purchase amounts, currency, program status, limits, and permissions.
- [x] Enforce idempotency for cashier submissions and external references to prevent duplicate awards.
- [x] Make balance changes and ledger writes atomic; test concurrent purchases and simultaneous redemptions.
- [x] Add staff customer lookup by QR/token and a purchase entry flow with a review/confirmation step.
- [x] Allow only authorized managers/owners to make manual adjustments and require a reason; record adjustments as ledger entries.
- [x] Provide customer and merchant transaction histories with appropriate field-level data limits.
- [x] Publish a tenant-scoped loyalty transaction event only after the database transaction commits, using a durable outbox or equivalent.

**Done when:** Staff can identify a customer, enter a purchase, receive a server-calculated result, and the customer balance/history update exactly once.

## 9. Rewards and Redemption Verification

- [ ] Implement reward create, edit, activate/deactivate, and list operations with tenant scoping and validation.
- [ ] Support reward cost by loyalty type, description, terms, expiration, and optional redemption limits.
- [ ] Show customers active rewards, their cost, and whether their membership has sufficient balance.
- [ ] Create redemption records with secure, short-lived or otherwise appropriately bounded opaque verification codes; store codes safely and prevent guessing.
- [ ] Atomically validate membership, tenant, reward status, expiration, balance, usage limits, and code state before reserving/redeeming value.
- [ ] Provide staff code verification and a distinct final redeem action so checking a code does not consume it prematurely.
- [ ] Make redemption completion single-use and idempotent; prevent double-spend under concurrent requests.
- [ ] Record who verified/completed a redemption, when it occurred, and associated loyalty ledger entries.
- [ ] Test expired, invalid, reused, cross-tenant, insufficient-balance, and concurrent redemption attempts.

**Done when:** A reward can be securely requested by a customer, verified by staff, redeemed once, and reflected in the immutable ledger.

## 10. Merchant Operations: Customers, Staff, Campaigns

- [ ] Build a tenant-scoped customer list with search, filters, pagination, status, membership balance, join date, and last activity.
- [ ] Build a customer detail view with loyalty history, reward history, and only permitted profile information.
- [ ] Implement staff invitation, role assignment, activation/deactivation, and merchant-scoped membership management.
- [ ] Build campaign create/edit/publish/archive flows with start/end time, status, terms, and `ALL_CUSTOMERS` audience for MVP.
- [ ] Ensure campaign schedule evaluation uses merchant timezone and clearly handles start/end boundaries.
- [ ] Record campaign participation events needed for future measurement without implementing advanced targeting.
- [ ] Enforce permissions for every staff-management and campaign action.

**Done when:** Merchant users can manage their own customers, staff, and basic campaigns without access to another merchant's records.

## 11. Analytics and Super Admin

- [ ] Implement merchant analytics for total/new/active customers, loyalty issued/redeemed, reward redemptions, and basic campaign participation.
- [ ] Define metric formulas, time windows, timezone handling, and ledger sources so dashboard numbers are reproducible.
- [ ] Ensure every merchant analytics query is tenant-scoped and test against cross-tenant data.
- [ ] Implement a separate super-admin area with platform-wide merchant, user, customer, transaction, and redemption metrics.
- [ ] Build merchant search/detail and activate/suspend actions for super admins; audit each sensitive action.
- [ ] Add pagination, safe filtering, and export limits where exports are included.
- [ ] Show empty/loading/error states and avoid presenting incomplete or stale metrics as exact without indicating their status.

**Done when:** Merchant metrics contain only their tenant's data, while authorized super admins can monitor and manage platform entities with an audit trail.

## 12. Future-Capability Architecture (No Phase 1 Feature Build)

- [ ] Define versioned API contracts and provider-neutral adapters for future Wallet, POS, WhatsApp, and SMS integrations.
- [ ] Add domain event contracts for customer enrollment, loyalty transactions, reward redemption, and campaign lifecycle; include tenant context and minimum necessary data.
- [ ] Add durable event/outbox delivery with retry, deduplication, idempotency, failure visibility, and safe replay; ensure consumers cannot write balances directly.
- [ ] Keep provider identifiers separate from canonical platform IDs and scoped integration configuration separate from core business entities.
- [ ] Define POS transaction mapping, external reference uniqueness, duplicate detection, correction/reversal, and reconciliation contracts. Keep payment processing out of scope.
- [ ] Define notification interfaces for channel adapters, provider callbacks, delivery status, templates, opt-out, and per-channel customer consent; no marketing send without required consent.
- [ ] Keep gamification definitions/versioning separate from the ledger. Any future points/stamps awarded by challenges or badges must use the existing loyalty transaction service.
- [ ] Define a governed analytics boundary for future AI and predictive models: tenant-scoped data, minimization, retention, access logging, and no cross-tenant model use without explicit authorization and legal basis.
- [ ] Require AI output to be advisory by default, with review and normal business-rule authorization before actions; AI cannot directly alter balances, redeem rewards, or publish campaigns.
- [ ] Keep Apple Wallet and Google Wallet pass state behind adapters linked to stable loyalty membership identifiers; do not add Wallet-specific logic to customer, reward, or transaction core models.
- [ ] Document which extension points are implemented in Phase 1 and which adapters/services remain future work.

**Done when:** Core MVP workflows operate without external providers, while documented contracts and data boundaries permit future integrations without rewriting the loyalty ledger.

## 13. Testing and Quality Gates

- [ ] Add unit tests for points/stamp calculation, rounding, expiry, campaign boundaries, permission checks, and redemption state transitions.
- [ ] Add integration tests against PostgreSQL for TypeORM migrations, tenant-scoped queries, transactions, constraints, and ledger consistency.
- [ ] Add Redis-dependent tests for rate limits/queues only where Redis is used; verify the intended fallback/failure behavior.
- [ ] Add API tests for authentication, authorization, validation errors, idempotency, and cross-tenant access denial.
- [ ] Add end-to-end tests for merchant onboarding, customer enrollment, staff purchase award, customer reward redemption, and cashier verification.
- [ ] Add accessibility checks for keyboard navigation, forms, dialogs, contrast, and screen-reader labels on core workflows.
- [ ] Run format, lint, type-check, unit, integration, end-to-end, and production-build checks in CI.
- [ ] Verify logs and error responses do not expose secrets or unnecessary personal data.

**Done when:** The required CI checks pass and the complete core product loop is covered by automated tests, including tenant-isolation and concurrent-redemption cases.

## 14. Deployment and MVP Release

- [ ] Provision production PostgreSQL and Redis with authentication, network restrictions, encryption in transit, and appropriate backups/retention.
- [ ] Configure secret management, environment separation, TLS, secure cookies, trusted origins, and production rate limits.
- [ ] Run reviewed database migrations as a deployment step with a recovery plan; never run automatic schema synchronization in production.
- [ ] Configure centralized logs, error tracking, health checks, and alerts for API failures, queue/outbox backlog, database failures, and suspicious authentication/redemption activity.
- [ ] Test backup restoration and document operational ownership for incidents and data requests.
- [ ] Complete a production-like end-to-end smoke test with separate merchant tenants and test customer/staff accounts.
- [ ] Confirm Phase 1 non-goals remain disabled/unimplemented and future architecture criteria are documented.
- [ ] Obtain release sign-off against the PRD's Phase 1 Definition of Done.

**Done when:** The production deployment is observable, recoverable, tenant-isolation-tested, and the core merchant-to-customer loyalty loop works end to end.
