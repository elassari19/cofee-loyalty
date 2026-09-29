Absolutely. Below is a **Phase 1 MVP PRD** structured so it can be handed directly to a development team, agency, or used as the foundation for a technical specification.

# PRD — B2B Multi-Tenant Loyalty SaaS Platform

**Product type:** B2B SaaS
**Target businesses:** Cafés, restaurants, coffee shops, salons, gyms, retail/local businesses, and similar SMBs
**Primary users:** Platform Super Admins, Merchants, Merchant Staff/Cashiers, Customers
**Phase:** Core MVP / Phase 1

---

# 1. Product Overview

The product is a **multi-tenant loyalty SaaS platform** that allows local businesses to create and operate digital loyalty programs for their customers.

A merchant can:

- Create and configure a loyalty program
- Choose between **points-based loyalty** and **stamp-card loyalty**
- Register customers through QR codes
- Track customers and loyalty activity
- Award points or stamps
- Create rewards
- Redeem rewards
- Create offers/campaigns
- Manage staff/cashiers
- View basic analytics
- Manage their business settings

Customers can:

- Register for a merchant's loyalty program
- Identify themselves through QR codes
- Earn points/stamps
- View their loyalty balance
- View available rewards
- Redeem rewards
- View transaction/activity history
- View merchant offers

The platform owner can manage the entire SaaS through a **Super Admin dashboard**.

---

# 2. Product Goals

## Primary goals

### G1 — Enable merchants to launch loyalty programs quickly

A merchant should be able to create a loyalty program without technical knowledge.

Example:

> "Every €1 spent = 1 point. 100 points = €5 reward."

Or:

> "Buy 9 coffees, get the 10th free."

---

### G2 — Make customer enrollment extremely simple

A customer should be able to scan a QR code at the merchant location and register.

Example:

```text
Customer
   ↓
Scan QR
   ↓
Loyalty registration page
   ↓
Create account
   ↓
Join merchant loyalty program
   ↓
Receive customer QR / loyalty identity
```

---

### G3 — Make loyalty operations simple for staff

A cashier should be able to:

```text
Identify customer
      ↓
Enter transaction
      ↓
Award points/stamp
      ↓
Customer balance updated
```

And:

```text
Customer presents reward
      ↓
Staff verifies reward
      ↓
Redeem
      ↓
Reward marked as redeemed
```

---

### G4 — Provide merchants with actionable basic analytics

Merchants should understand:

- How many customers they have
- How many active customers they have
- Points/stamps issued
- Rewards redeemed
- Customer activity
- Campaign performance
- Loyalty program performance

---

### G5 — Establish a scalable multi-tenant foundation

The architecture must support many merchants without exposing one merchant's data to another merchant.

Example:

```text
Platform
│
├── Merchant A
│   ├── Customers
│   ├── Transactions
│   ├── Rewards
│   └── Staff
│
├── Merchant B
│   ├── Customers
│   ├── Transactions
│   ├── Rewards
│   └── Staff
│
└── Merchant C
    ├── Customers
    ├── Transactions
    ├── Rewards
    └── Staff
```

---

# 3. Non-Goals — Phase 1

The following should **not** be part of the Phase 1 MVP.

### Explicitly out of scope

- Apple Wallet integration
- Google Wallet integration
- POS integrations
- Advanced AI
- AI-generated campaigns
- AI customer segmentation
- WhatsApp integration
- SMS marketing
- Email marketing automation
- Advanced gamification
- Leaderboards
- Badges
- Challenges
- Weather-based campaigns
- Predictive analytics
- Advanced recommendation engines
- Dynamic pricing
- Advanced marketing automation
- Complex referral systems
- Cryptocurrency/token rewards
- Advanced subscription billing functionality
- Full accounting
- Inventory management
- Restaurant ordering
- Payment processing
- Multi-location enterprise management unless explicitly required by the implementation

These capabilities are out of scope for Phase 1 implementation, but their architectural foundations are in scope: Phase 1 must preserve the extension points, stable contracts, tenant isolation, and data boundaries needed to add them without rewriting the loyalty core.

---

# 4. User Types

## 4.1 Super Admin

The platform owner/operator.

Responsibilities:

- Manage merchants
- Manage users
- Monitor platform activity
- Manage subscriptions
- Monitor platform analytics
- Suspend merchants
- Configure platform settings

---

# 4.2 Merchant Owner/Admin

The business owner or manager.

Responsibilities:

- Configure business
- Configure loyalty program
- Manage customers
- Manage rewards
- Manage campaigns
- Manage staff
- View analytics
- Manage loyalty transactions

---

# 4.3 Merchant Staff/Cashier

A restricted merchant user.

Responsibilities:

- Identify customers
- Add loyalty transactions
- Award points/stamps
- Redeem rewards
- View limited customer information

Staff should **not** have access to sensitive merchant administration functionality.

---

# 4.4 Customer

The end consumer.

Responsibilities:

- Register
- Join a loyalty program
- View loyalty balance
- View rewards
- Redeem rewards
- View activity
- View offers

---

# 5. Core Product Architecture

The application should conceptually be separated into:

```text
                    SaaS Platform
                         │
              ┌──────────┴──────────┐
              │                     │
        Super Admin             Merchant
                                  │
                       ┌──────────┼──────────┐
                       │          │          │
                    Owner      Manager     Staff
                       │
                       ▼
                  Loyalty Program
                       │
                       ▼
                    Customers
                       │
              ┌────────┴────────┐
              │                 │
           Points             Stamps
              │                 │
              └────────┬────────┘
                       │
                    Rewards
                       │
                   Redemption
```

---

# 6. Multi-Tenant Architecture

This is one of the most important requirements.

Every merchant represents a **tenant**.

For example:

```text
tenant_id = merchant_A
tenant_id = merchant_B
tenant_id = merchant_C
```

Merchant-specific entities should be associated with the tenant.

Examples:

```text
Merchant
Customer
Staff
LoyaltyProgram
Transaction
Reward
RewardRedemption
Campaign
```

should have a relationship to the appropriate merchant/tenant.

### Critical requirement

A Merchant A API request must never be able to access Merchant B's:

- customers
- transactions
- rewards
- staff
- campaigns
- analytics
- loyalty balances

Tenant authorization must happen **server-side**, not only through frontend filtering.

---

# 7. Authentication & Authorization

The platform should support secure authentication.

## Authentication

Potential MVP functionality:

- Email/password registration
- Email/password login
- Password reset
- Email verification
- Logout
- Session management
- Optional social authentication later

---

# 8. Role-Based Access Control

Recommended roles:

```text
SUPER_ADMIN

MERCHANT_OWNER
MERCHANT_MANAGER
MERCHANT_STAFF

CUSTOMER
```

Example permissions:

| Capability          | Super Admin | Owner |  Manager |       Staff |     Customer |
| ------------------- | ----------: | ----: | -------: | ----------: | -----------: |
| Platform management |          ✅ |    ❌ |       ❌ |          ❌ |           ❌ |
| Merchant settings   |          ✅ |    ✅ |  Limited |          ❌ |           ❌ |
| Loyalty settings    |          ✅ |    ✅ |       ✅ |          ❌ |           ❌ |
| Staff management    |          ✅ |    ✅ | Optional |          ❌ |           ❌ |
| Customer management |          ✅ |    ✅ |       ✅ |     Limited |     Own data |
| Transactions        |          ✅ |    ✅ |       ✅ | Create/View |          Own |
| Rewards             |          ✅ |    ✅ |       ✅ |      Redeem |  View/Redeem |
| Campaigns           |          ✅ |    ✅ |       ✅ |          ❌ |         View |
| Analytics           |          ✅ |    ✅ |       ✅ |     Limited | Own activity |

Permissions should be designed as a permission system rather than hard-coded everywhere.

Example:

```text
customers.read
customers.write

transactions.create
transactions.read

rewards.create
rewards.redeem

campaigns.create
campaigns.publish

staff.manage

analytics.read
```

This makes future roles easier to introduce.

---

# 9. Merchant Onboarding

A merchant should be able to:

1. Register
2. Create business profile
3. Configure business information
4. Select loyalty model
5. Configure loyalty rules
6. Create initial reward
7. Generate customer QR code
8. Invite staff
9. Start accepting customers

---

# 10. Merchant Profile

Merchant information should include:

- Business name
- Logo
- Description
- Category
- Address
- Phone
- Email
- Website
- Opening hours
- Currency
- Timezone
- Business status

Optional future fields:

- Multiple locations
- Social media
- Brand colors
- Custom domain

---

# 11. Loyalty Program

The merchant chooses one loyalty model.

## Model A — Points

Example:

```text
€1 spent = 1 point

100 points = €5 reward
```

Merchant should be able to configure:

- Program name
- Point name
- Earning rules
- Redemption rules
- Expiration policy
- Minimum transaction
- Reward thresholds

Example:

```text
Spend €1 → 1 point

100 points → €5 reward
250 points → €15 reward
500 points → €35 reward
```

---

# 12. Stamp Card

Example:

```text
☕ ☕ ☕ ☕ ☕ ☕ ☕ ☕ ☕ ⬜

9 stamps → 10th coffee free
```

Merchant configures:

- Stamp card name
- Required number of stamps
- Reward
- Stamp earning condition
- Expiration
- Maximum stamps per transaction

Example:

```text
1 qualifying purchase = 1 stamp

10 stamps = Free coffee
```

---

# 13. Loyalty Transaction Engine

The transaction engine is the core of the platform.

Possible transaction types:

```text
POINTS_EARNED
POINTS_ADJUSTED
POINTS_REDEEMED

STAMP_EARNED
STAMP_ADJUSTED
STAMP_REDEEMED

REWARD_REDEEMED
```

Transactions should be immutable or audit-friendly wherever possible.

Instead of simply:

```text
customer.points = 100
```

the system should maintain a transaction history:

```text
+20 points
+30 points
-50 points
+40 points
```

Current balance can then be calculated from the ledger or maintained as a safely synchronized balance.

---

# 14. Customer Registration

## QR-based registration

Each merchant receives a registration QR code.

Example:

```text
https://app.example.com/join/merchant_abc
```

Customer scans QR.

They see:

```text
Welcome to Café ABC

Join our loyalty program

[ Join Loyalty Program ]
```

Then:

```text
Name
Email
Phone
Password
```

Depending on the authentication design, customer registration can also be passwordless later.

---

# 15. Customer Identity

Each customer should have a unique platform identity.

Recommended model:

```text
User
   │
   └── CustomerProfile
          │
          ├── Merchant A membership
          ├── Merchant B membership
          └── Merchant C membership
```

This is important because a customer may eventually belong to multiple merchants.

The platform should therefore avoid designing the database around:

```text
one customer = one merchant
```

Instead:

```text
Customer
   ↓
MerchantMembership
   ↓
Merchant
```

This gives the platform more flexibility later.

---

# 16. Customer Dashboard

Customer should see:

### Overview

```text
Hello Hicham

Café ABC

Current balance
245 points

Progress
245 / 500

Available rewards
----------------
€5 OFF
100 points

Free Coffee
250 points
```

### Sections

- Overview
- Loyalty balance
- Rewards
- Activity
- Offers
- Profile

---

# 17. Customer Activity

Customer should be able to view:

```text
Today
+20 points
Purchase

Yesterday
+15 points
Purchase

Aug 20
-100 points
€5 reward redeemed
```

Each transaction should show:

- Date
- Merchant
- Type
- Amount
- Points/stamps
- Reference
- Status

---

# 18. Rewards

Merchant can create rewards.

Example:

```text
Reward:
€5 Discount

Cost:
100 points

Description:
Get €5 off your next purchase.

Status:
Active
```

Another example:

```text
Reward:
Free Cappuccino

Cost:
10 stamps

Status:
Active
```

Reward fields:

- Name
- Description
- Image
- Cost
- Loyalty type
- Expiration
- Redemption limit
- Active/inactive
- Terms/conditions

---

# 19. Reward Redemption

Customer selects:

```text
€5 OFF
100 points

[ Redeem ]
```

System validates:

```text
Customer exists
Customer belongs to merchant
Reward exists
Reward active
Customer has sufficient balance
Reward not expired
```

Then creates a redemption.

Example:

```text
RewardRedemption

id
customer_id
merchant_id
reward_id
points_used
status
created_at
redeemed_at
redeemed_by
```

---

# 20. Redemption Verification

A reward should have a secure redemption mechanism.

For MVP:

```text
Customer generates redemption code
        ↓
Staff enters/scans code
        ↓
Backend validates
        ↓
Reward marked redeemed
```

Example:

```text
REWARD CODE

A7K9-X2P4

€5 OFF

[ Show to cashier ]
```

Staff:

```text
Enter code:

[A7K9-X2P4]

[ Verify ]
```

Backend confirms:

```text
VALID

€5 OFF
Customer: John
Status: Unused

[ Redeem ]
```

---

# 21. Merchant Customer Management

Merchant dashboard should provide:

- Customer list
- Search
- Filters
- Customer profile
- Loyalty balance
- Transaction history
- Reward history
- Registration date
- Last activity
- Customer status

Example:

```text
Customers

Search customer...

John Smith       245 pts     Active
Sarah Jones      90 pts      Active
Mike Brown       0 pts       Inactive
```

---

# 22. Manual Loyalty Adjustments

Merchant admins should be able to manually adjust loyalty balances.

Example:

```text
Customer: John

Current: 245 points

Adjustment:
+50

Reason:
Compensation

[ Confirm ]
```

Every manual adjustment must be recorded.

Example:

```text
Adjustment:
+50 points

Performed by:
Merchant Manager

Reason:
Customer service compensation

Date:
2026-09-29
```

---

# 23. Staff/Cashier Application

Staff should use the same merchant application.

After login:

```text
Staff Dashboard

[ Add Transaction ]

[ Scan Customer ]

[ Redeem Reward ]

Recent Activity
```

Staff should not see:

- Subscription settings
- Billing
- Merchant ownership settings
- Staff management
- Sensitive platform configuration

---

# 24. Customer Identification

MVP should support QR-based customer identification.

Possible flow:

```text
Customer opens loyalty QR
        ↓
Cashier scans QR
        ↓
Customer identified
        ↓
Cashier enters purchase
        ↓
Points/stamp calculated
        ↓
Transaction confirmed
```

The QR should **not contain sensitive customer information**.

Use an opaque identifier/token instead.

---

# 25. Transaction Entry

Cashier can enter:

```text
Customer
John Smith

Purchase amount
€23.50

[ Add Loyalty ]
```

Backend calculates loyalty according to merchant configuration.

Example:

```text
€23.50
× 1 point per €
= 23 points
```

System records:

```text
Transaction
€23.50

+23 points
```

---

# 26. Offers & Campaigns

Merchants should be able to create simple campaigns.

Example:

```text
Campaign:

Double Points Weekend

From:
Friday

To:
Sunday

Rule:
2x points

Status:
Active
```

Another:

```text
Campaign:

Free Coffee Week

Reward:
Free coffee

Audience:
All loyalty members

Start:
01/10

End:
07/10
```

---

# 27. Campaign Fields

Campaign:

- Name
- Description
- Image
- Start date
- End date
- Status
- Loyalty multiplier or reward
- Audience
- Terms
- Usage limits

MVP audience can be:

```text
ALL_CUSTOMERS
```

More advanced segmentation can be added later.

---

# 28. Basic Analytics

Merchant dashboard should provide:

### Customer metrics

- Total customers
- New customers
- Active customers
- Returning customers

### Loyalty metrics

- Points issued
- Points redeemed
- Stamps issued
- Rewards redeemed

### Reward metrics

- Most redeemed rewards
- Redemption rate

### Campaign metrics

- Active campaigns
- Campaign participation

Example:

```text
This Month

Customers
1,284

New Customers
+182

Points Issued
24,560

Points Redeemed
8,430

Rewards Redeemed
347
```

---

# 29. Super Admin Dashboard

Super Admin should have a separate administrative interface.

## Dashboard

Metrics:

```text
Total Merchants
342

Active Merchants
318

Total Customers
82,450

Transactions
1,284,923

Rewards Redeemed
83,214
```

---

# 30. Merchant Management

Super Admin can:

- View merchants
- Search merchants
- Filter merchants
- View merchant details
- Activate merchant
- Suspend merchant
- View merchant users
- View merchant statistics
- View subscription status

Example:

```text
Merchant

Café ABC
Status: Active
Plan: Pro
Customers: 1,284
Transactions: 23,421
Created: 2026-08-01

[ View ]
[ Suspend ]
```

---

# 31. Platform User Management

Super Admin can manage:

- Merchant owners
- Merchant managers
- Staff
- Platform admins

Actions:

- Search
- View
- Suspend
- Activate
- Change role
- Reset access where appropriate

---

# 32. Subscription-Ready Architecture

Phase 1 does not necessarily need complete billing.

However, the architecture should support:

```text
Merchant
   │
   └── Subscription
          │
          ├── Plan
          ├── Status
          ├── Limits
          ├── Start date
          ├── Renewal date
          └── Provider metadata
```

Example plans:

```text
FREE
STARTER
PRO
BUSINESS
```

Potential limits:

```text
max_staff
max_customers
max_rewards
max_campaigns
locations
analytics_level
```

A billing provider such as Stripe can be integrated later without restructuring merchant entities.

---

# 33. Apple Wallet / Google Wallet Architecture

This is a critical architectural requirement.

**Phase 1 does not implement Wallet integrations.**

However, the loyalty system should expose a clean loyalty identity layer.

Example:

```text
Customer
   │
   └── LoyaltyMembership
          │
          ├── merchant_id
          ├── customer_id
          ├── loyalty_type
          ├── balance
          └── external_identifiers
```

Later:

```text
LoyaltyMembership
       │
       ├── Apple Wallet Pass
       │
       └── Google Wallet Pass
```

Do not build Wallet-specific logic directly into:

```text
Transaction
Reward
Customer
Merchant
```

Instead create an integration abstraction.

Example conceptual architecture:

```text
Loyalty Core
     │
     ├── Apple Wallet Adapter
     │
     ├── Google Wallet Adapter
     │
     └── Future Integrations
```

This allows another developer to implement the integrations later without rewriting the loyalty engine.

## Architecture for Additional Future Capabilities

The capabilities below remain out of scope for Phase 1 implementation. Phase 1 should establish the following boundaries so they can be introduced incrementally without coupling providers or future feature logic to the loyalty ledger.

### Shared integration foundation

- Keep external providers behind adapters with provider-neutral interfaces. Provider credentials and configuration must be stored securely and scoped to the platform or merchant that owns them.
- Publish domain events for committed business changes, such as `customer.joined`, `loyalty.transaction.created`, `reward.redeemed`, and `campaign.started`. Consumers must not be able to mutate the core ledger by handling an event.
- Deliver events asynchronously through a durable outbox or equivalent mechanism, with retries, deduplication, idempotency keys, failure visibility, and replay controls. Event payloads must carry tenant context and only the minimum necessary personal data.
- Expose versioned APIs and webhook contracts for future consumers. Authenticate and authorize each call server-side, enforce tenant scope, and record security-sensitive activity in audit logs.
- Keep provider-specific identifiers in integration records linked to the relevant merchant, customer, or loyalty membership. Do not make provider IDs the platform's canonical identity.

### POS integrations

POS connectivity must use provider adapters that translate external purchase/customer events into the platform's canonical transaction contract. Preserve the external transaction reference, support idempotent imports and duplicate detection, and define reconciliation and error handling for delayed, corrected, or reversed events. POS integrations may initiate loyalty processing but must not bypass backend earning rules, authorization, or the immutable loyalty ledger. Payment processing remains out of scope.

### WhatsApp and SMS

Model outbound communication as a notification capability with channel adapters, queued delivery, provider status callbacks, retry limits, and delivery audit records. Keep templates, provider configuration, and delivery status separate from campaigns and loyalty transactions. Store channel consent, opt-out state, and applicable legal basis/preferences per customer and channel; check them at send time. Do not send marketing messages without the required consent, and do not expose customer contact details to unrelated tenants or providers.

### Advanced gamification

Keep gamification rules separate from the points/stamps ledger and represent mechanics such as badges, challenges, streaks, and leaderboards as configurable, versioned definitions evaluated from authorized domain events. Any loyalty value awarded by a mechanic must be issued through the existing loyalty transaction engine and ledger. Include eligibility, time windows, limits, anti-abuse controls, and tenant-level enablement so new mechanics cannot grant unbounded or cross-merchant value.

### AI and predictive analytics

Keep model inference and predictive features behind a separately deployable service or module that consumes governed, tenant-scoped data through explicit contracts. Separate analytical datasets from operational records; apply data minimization, retention controls, access logging, and applicable consent/privacy requirements. Do not use customer data across tenants for training or inference unless explicitly authorized and legally permitted. Predictions and generated content must be labeled as recommendations, with confidence/context where appropriate, human review for consequential actions, and a non-AI fallback. AI must not directly change balances, redeem rewards, or execute campaigns; all resulting actions must pass existing authorization and business-rule validation.

### Phase 1 readiness criteria

- Loyalty writes produce durable, tenant-scoped domain events without requiring external providers.
- Core APIs and event payloads have explicit versions, idempotency behavior, and documented ownership.
- Integration configuration, credentials, consent/preferences, and external identifiers have clear ownership and tenant boundaries.
- Async delivery failures can be observed and safely retried without duplicate loyalty transactions or messages.
- The loyalty ledger remains the sole authority for points, stamps, and redemptions; future modules cannot write balances directly.

---

# 34. API Architecture

The backend should expose a clean API structure.

Example:

```text
/api/auth

/api/merchants
/api/merchants/:merchantId

/api/customers
/api/customers/:customerId

/api/loyalty
/api/loyalty/programs

/api/transactions
/api/transactions/:id

/api/rewards
/api/rewards/:id

/api/redemptions

/api/campaigns

/api/staff

/api/analytics

/api/admin
```

Every protected endpoint must perform:

```text
Authentication
      ↓
Authorization
      ↓
Tenant validation
      ↓
Business validation
      ↓
Database operation
```

---

# 35. Security Requirements

Security is a core MVP requirement.

## Authentication

- Secure password hashing
- Secure sessions/tokens
- Password reset
- Email verification
- Session expiration
- Logout/invalidation

## Authorization

Every protected resource must validate permissions.

Never trust:

```text
merchantId
userId
customerId
```

sent by the frontend.

The backend must determine what the authenticated user is allowed to access.

---

# 36. Tenant Isolation

Every database query involving tenant data should enforce tenant ownership.

Conceptually:

```ts
where: {
  id: customerId,
  merchantId: authenticatedMerchantId
}
```

Not:

```ts
where: {
  id: customerId;
}
```

This should be treated as a **security invariant**.

---

# 37. Audit Logging

Important actions should generate audit events.

Examples:

```text
USER_LOGIN

CUSTOMER_CREATED

POINTS_AWARDED

POINTS_ADJUSTED

REWARD_CREATED

REWARD_REDEEMED

STAFF_CREATED

STAFF_ROLE_CHANGED

CAMPAIGN_CREATED

MERCHANT_SUSPENDED
```

Audit record:

```text
actor
tenant
action
resource
resource_id
metadata
timestamp
IP/device information where appropriate
```

---

# 38. Data Model — High-Level

A possible MVP data model:

```text
User
├── id
├── email
├── password_hash
├── role
├── status
└── timestamps

Merchant
├── id
├── name
├── logo
├── category
├── address
├── currency
├── timezone
├── status
└── timestamps

MerchantMembership
├── id
├── merchant_id
├── user_id
├── role
└── status

CustomerProfile
├── id
├── user_id
├── name
├── phone
└── timestamps

LoyaltyProgram
├── id
├── merchant_id
├── type
├── name
├── configuration
├── status
└── timestamps

LoyaltyMembership
├── id
├── merchant_id
├── customer_id
├── balance
└── status

LoyaltyTransaction
├── id
├── merchant_id
├── customer_id
├── type
├── amount
├── points
├── stamps
├── metadata
├── created_by
└── timestamps

Reward
├── id
├── merchant_id
├── name
├── description
├── cost
├── type
├── status
└── timestamps

RewardRedemption
├── id
├── merchant_id
├── customer_id
├── reward_id
├── status
├── code
├── redeemed_by
└── timestamps

Campaign
├── id
├── merchant_id
├── name
├── configuration
├── start_at
├── end_at
├── status
└── timestamps

AuditLog
├── id
├── merchant_id
├── actor_id
├── action
├── resource
├── resource_id
├── metadata
└── created_at

Subscription
├── id
├── merchant_id
├── plan
├── status
├── provider
└── provider_reference
```

---

# 39. Important Domain Design Decision

I would strongly recommend separating these concepts:

```text
Customer
```

from:

```text
LoyaltyMembership
```

and:

```text
LoyaltyTransaction
```

For example:

```text
Customer
   │
   ├── Membership → Café A
   │       └── 120 points
   │
   └── Membership → Restaurant B
           └── 8 stamps
```

This gives you a much stronger foundation for future expansion.

---

# 40. User Stories

## Epic 1 — Authentication

### US-001 — Merchant registration

**As a** merchant
**I want** to create an account
**So that** I can create and manage my loyalty program.

**Acceptance criteria**

- Merchant can enter required registration information.
- Email must be unique.
- Password meets security requirements.
- Account is created.
- Merchant can log in.
- Merchant receives the correct merchant role.

---

### US-002 — Merchant login

**As a** merchant
**I want** to log into my account
**So that** I can access my dashboard.

**Acceptance criteria**

- Valid credentials authenticate successfully.
- Invalid credentials are rejected.
- User is redirected to the correct dashboard.
- Session is securely established.

---

### US-003 — Staff login

**As a** staff member
**I want** to log into the merchant application
**So that** I can process loyalty transactions.

---

### US-004 — Password reset

**As a** user
**I want** to reset my password
**So that** I can recover access to my account.

---

# Epic 2 — Merchant Onboarding

### US-005 — Create business profile

**As a** merchant owner
**I want** to create my business profile
**So that** customers can identify my business.

---

### US-006 — Select loyalty model

**As a** merchant
**I want** to choose between points and stamps
**So that** I can use the loyalty model appropriate for my business.

**Acceptance criteria**

- Merchant can select Points.
- Merchant can select Stamps.
- Loyalty configuration reflects the selected model.
- Merchant cannot accidentally mix incompatible configurations.

---

### US-007 — Configure points program

**As a** merchant
**I want** to configure how customers earn and redeem points
**So that** the loyalty program follows my business rules.

---

### US-008 — Configure stamp program

**As a** merchant
**I want** to configure stamp requirements and rewards
**So that** customers can progress through my stamp card.

---

# Epic 3 — Customer Registration

### US-009 — Generate merchant QR code

**As a** merchant
**I want** to generate a customer registration QR code
**So that** customers can easily join my loyalty program.

---

### US-010 — Customer scans QR

**As a** customer
**I want** to scan a QR code
**So that** I can join the merchant's loyalty program.

---

### US-011 — Customer registration

**As a** customer
**I want** to register my account
**So that** I can participate in the loyalty program.

---

### US-012 — Join loyalty program

**As a** customer
**I want** to join a merchant's loyalty program
**So that** I can earn rewards.

---

# Epic 4 — Customer Loyalty

### US-013 — View loyalty balance

**As a** customer
**I want** to see my current points/stamps
**So that** I know my progress.

---

### US-014 — Earn points

**As a** customer
**I want** to earn points from purchases
**So that** I can unlock rewards.

---

### US-015 — Earn stamps

**As a** customer
**I want** to receive stamps for qualifying purchases
**So that** I can complete my stamp card.

---

### US-016 — View loyalty history

**As a** customer
**I want** to see my loyalty transaction history
**So that** I can understand how my balance changed.

---

# Epic 5 — Staff Operations

### US-017 — Identify customer

**As a** cashier
**I want** to scan a customer's QR code
**So that** I can identify their loyalty account.

---

### US-018 — Record transaction

**As a** cashier
**I want** to enter a customer's purchase
**So that** the system can award loyalty automatically.

---

### US-019 — Award loyalty

**As a** cashier
**I want** the system to calculate the correct points/stamp
**So that** loyalty is applied consistently.

---

### US-020 — Prevent invalid transactions

**As a** merchant
**I want** the system to validate loyalty transactions
**So that** staff cannot accidentally award invalid loyalty.

Examples:

- Negative purchase
- Invalid customer
- Inactive program
- Excessive manual adjustment
- Unauthorized staff action

---

# Epic 6 — Rewards

### US-021 — Create reward

**As a** merchant
**I want** to create a reward
**So that** customers can exchange loyalty value for benefits.

---

### US-022 — Edit reward

**As a** merchant
**I want** to edit a reward
**So that** I can keep my offers current.

---

### US-023 — Disable reward

**As a** merchant
**I want** to deactivate a reward
**So that** customers cannot redeem unavailable rewards.

---

### US-024 — View available rewards

**As a** customer
**I want** to see rewards available to me
**So that** I can choose what to redeem.

---

### US-025 — Redeem reward

**As a** customer
**I want** to redeem a reward
**So that** I can use my loyalty balance.

---

### US-026 — Verify reward

**As a** cashier
**I want** to verify a customer's redemption code
**So that** I can confirm the reward is valid.

---

### US-027 — Complete redemption

**As a** cashier
**I want** to complete a reward redemption
**So that** the reward cannot be reused.

---

# Epic 7 — Customer Management

### US-028 — View customers

**As a** merchant
**I want** to see all my customers
**So that** I can understand my loyalty base.

---

### US-029 — Search customers

**As a** merchant
**I want** to search customers
**So that** I can quickly find someone.

---

### US-030 — View customer profile

**As a** merchant
**I want** to view a customer's loyalty profile
**So that** I can assist them.

---

### US-031 — Adjust customer loyalty

**As a** merchant manager
**I want** to manually adjust a customer's points/stamps
**So that** I can handle customer-service situations.

---

# Epic 8 — Staff Management

### US-032 — Invite staff

**As a** merchant owner
**I want** to invite staff
**So that** employees can operate the loyalty system.

---

### US-033 — Assign staff role

**As a** merchant owner
**I want** to assign a staff member a role
**So that** they receive appropriate permissions.

---

### US-034 — Disable staff account

**As a** merchant owner
**I want** to deactivate staff access
**So that** former employees cannot access the system.

---

# Epic 9 — Campaigns

### US-035 — Create campaign

**As a** merchant
**I want** to create an offer/campaign
**So that** I can encourage customer engagement.

---

### US-036 — Schedule campaign

**As a** merchant
**I want** to specify start and end dates
**So that** campaigns automatically become active/inactive.

---

### US-037 — Customer views campaign

**As a** customer
**I want** to see active merchant offers
**So that** I know what promotions are available.

---

# Epic 10 — Analytics

### US-038 — View customer metrics

**As a** merchant
**I want** to see customer statistics
**So that** I can understand my loyalty program's growth.

---

### US-039 — View loyalty metrics

**As a** merchant
**I want** to see points/stamps issued and redeemed
**So that** I can monitor program activity.

---

### US-040 — View reward metrics

**As a** merchant
**I want** to see reward redemption statistics
**So that** I know which rewards customers use.

---

# Epic 11 — Super Admin

### US-041 — View platform dashboard

**As a** Super Admin
**I want** to view platform-wide metrics
**So that** I can monitor the SaaS.

---

### US-042 — Manage merchants

**As a** Super Admin
**I want** to manage merchants
**So that** I can administer the platform.

---

### US-043 — Suspend merchant

**As a** Super Admin
**I want** to suspend a merchant
**So that** I can prevent access when necessary.

---

### US-044 — View merchant activity

**As a** Super Admin
**I want** to inspect merchant activity
**So that** I can support and administer the platform.

---

# Epic 12 — Security

### US-045 — Enforce tenant isolation

**As a** platform owner
**I want** every merchant's data to be isolated
**So that** merchants cannot access each other's information.

---

### US-046 — Enforce permissions

**As a** platform owner
**I want** permissions to be enforced by the backend
**So that** users cannot bypass restrictions through API requests.

---

### US-047 — Audit sensitive actions

**As a** platform owner
**I want** sensitive actions to be logged
**So that** the platform has an audit trail.

---

# Epic 13 — Subscription Readiness

### US-048 — Associate merchant with plan

**As a** platform owner
**I want** each merchant to have a subscription record
**So that** billing can be introduced later.

---

### US-049 — Enforce plan limits

**As a** platform owner
**I want** the system to support configurable plan limits
**So that** future subscription plans can control features and usage.

---

# Epic 14 — Future Wallet Integrations

### US-050 — Maintain wallet-ready loyalty identity

**As a** future integration developer
**I want** loyalty memberships to have stable identifiers
**So that** Apple Wallet and Google Wallet can reference them.

---

### US-051 — Wallet integration without core rewrite

**As a** future developer
**I want** wallet integrations isolated from the loyalty engine
**So that** I can implement Apple Wallet and Google Wallet without changing core loyalty functionality.

---

# 41. Core MVP Acceptance Criteria

The MVP should be considered functionally complete when this scenario works end-to-end:

```text
Merchant registers
        ↓
Creates business
        ↓
Selects Points or Stamps
        ↓
Configures loyalty rules
        ↓
Creates reward
        ↓
Generates QR
        ↓
Customer scans QR
        ↓
Customer registers
        ↓
Customer joins merchant
        ↓
Customer receives loyalty identity
        ↓
Cashier logs in
        ↓
Cashier scans customer
        ↓
Cashier records purchase
        ↓
Backend calculates loyalty
        ↓
Customer balance updates
        ↓
Customer sees reward
        ↓
Customer redeems reward
        ↓
Cashier verifies redemption
        ↓
Reward becomes redeemed
        ↓
Merchant sees transaction
        ↓
Analytics update
```

If this flow works securely, you have the **core product loop**.

---

# 42. Recommended MVP Navigation

## Super Admin

```text
Dashboard
Merchants
Users
Subscriptions
Analytics
Audit Logs
Settings
```

## Merchant Owner/Manager

```text
Dashboard
Customers
Loyalty Program
Transactions
Rewards
Campaigns
Staff
Analytics
Business Settings
Subscription
```

## Staff

```text
Dashboard
Scan Customer
Add Transaction
Redeem Reward
Recent Activity
```

## Customer

```text
Home
My Loyalty
Rewards
Activity
Offers
Profile
```

---

# 43. MVP Priority

I would divide the development into these priorities.

### P0 — Must Have

```text
Authentication
Multi-tenancy
RBAC
Merchant onboarding
Loyalty configuration
Points
Stamps
Customer registration
QR registration
Customer identity
Staff access
Transaction engine
Rewards
Redemption
Customer management
Basic analytics
Super Admin
Security
Audit logging
```

### P1 — Important

```text
Campaigns
Manual loyalty adjustments
Staff invitation
Subscription data model
Advanced filtering/search
Better analytics
Notification-ready architecture
```

### P2 — Future

```text
Apple Wallet
Google Wallet
POS integrations
WhatsApp
SMS
Email automation
AI
Advanced gamification
Predictive analytics
Weather automation
Advanced segmentation
Referral system
```

P2 features are not implemented in Phase 1. The shared integration foundation and Phase 1 readiness criteria in Section 33 are part of the Phase 1 architecture and should be validated before release.

---

# 44. Recommended Technical Architecture

For a modern TypeScript implementation, a structure like this works well:

```text
Frontend
└── Next.js
    ├── Admin
    ├── Merchant
    ├── Staff
    └── Customer

Backend
└── API / Server
    ├── Auth
    ├── Tenancy
    ├── Users
    ├── Merchants
    ├── Customers
    ├── Loyalty
    ├── Transactions
    ├── Rewards
    ├── Redemptions
    ├── Campaigns
        ├── Analytics
        ├── Gamification (future)
        ├── AI / Predictions (future)
        ├── Notifications / Consent (future)
    ├── Subscriptions
    └── Audit

Database
└── PostgreSQL

Cache / Jobs
└── Redis

Storage
└── Object Storage

Future Integrations
├── Apple Wallet
├── Google Wallet
├── POS adapters
├── WhatsApp adapter
├── SMS adapter
└── Other provider adapters

Shared platform capabilities
├── Versioned APIs and webhooks
├── Domain events and durable outbox
├── Async jobs, retries, idempotency, and observability
├── Consent and communication preferences
└── Tenant-scoped analytics and data governance
```

---

# 45. Most Important Architectural Principles

I would put these directly into the technical requirements for the developer.

### 1. Tenant isolation is mandatory

No API endpoint should rely on frontend-provided tenant IDs for authorization.

### 2. Loyalty logic belongs in the backend

The frontend should never determine:

```text
how many points a customer receives
```

The backend calculates it.

### 3. Use a transaction/ledger model

Don't simply overwrite loyalty balances.

Maintain an auditable history.

### 4. Separate identity from merchant membership

Use:

```text
User
CustomerProfile
LoyaltyMembership
Merchant
```

rather than making customers permanently belong to one merchant.

### 5. Separate loyalty engine from integrations

Wallets, POS, WhatsApp, AI, etc. should integrate **around** the core platform.

### 6. Build permissions as capabilities

Don't scatter checks such as:

```text
if role === "admin"
```

throughout the application.

Use permissions such as:

```text
customers.read
customers.update
transactions.create
rewards.create
rewards.redeem
staff.manage
analytics.read
```

### 7. Make subscription limits configurable

Don't hard-code:

```text
if merchant has > 500 customers
```

Instead:

```text
subscriptionPlan.limits.maxCustomers
```

### 8. Design APIs for future integrations

Future services should be able to consume stable APIs/events such as:

```text
customer.created
loyalty.transaction.created
reward.created
reward.redeemed
campaign.started
campaign.ended
```

This becomes particularly valuable for future Wallet, POS, WhatsApp and automation integrations.

---

# 46. Phase 1 Definition of Done

The project is ready for MVP release when:

- [ ] Super Admin authentication works
- [ ] Merchant authentication works
- [ ] Staff authentication works
- [ ] Customer authentication works
- [ ] RBAC is enforced server-side
- [ ] Multi-tenant isolation is tested
- [ ] Merchant onboarding works
- [ ] Merchant can configure points loyalty
- [ ] Merchant can configure stamp loyalty
- [ ] Customer can join through QR
- [ ] Staff can identify customer
- [ ] Staff can create loyalty transaction
- [ ] Points/stamps are calculated correctly
- [ ] Customer balance updates correctly
- [ ] Customer can see history
- [ ] Merchant can create rewards
- [ ] Customer can redeem rewards
- [ ] Staff can verify/redeem rewards
- [ ] Merchant can manage customers
- [ ] Merchant can manage staff
- [ ] Merchant can create campaigns
- [ ] Merchant can view basic analytics
- [ ] Super Admin can manage merchants
- [ ] Sensitive actions are audited
- [ ] Subscription architecture exists
- [ ] Wallet integration boundaries are documented
- [ ] API authorization is tested
- [ ] Tenant isolation tests exist
- [ ] Production error handling exists
- [ ] Database backups are configured
- [ ] Logging/monitoring is configured

---

## The core MVP in one sentence

> **A merchant signs up → creates a loyalty program → displays a QR code → customers join → staff award points/stamps → customers accumulate loyalty value → customers redeem rewards → merchants manage everything through their dashboard → the platform owner manages all merchants through Super Admin.**
