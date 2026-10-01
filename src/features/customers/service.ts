import QRCode from "qrcode";
import type {
  EntityManager,
  EntitySchema,
  ObjectLiteral,
  QueryDeepPartialEntity,
} from "typeorm";

import type { AuthContext } from "@/auth/context";
import { getDb } from "@/db/connection";
import type {
  LedgerType,
  LoyaltyMembershipStatus,
  LoyaltyType,
  MerchantStatus,
  RewardStatus,
} from "@/db/entities/enums";
import {
  CustomerProfileEntity,
  type CustomerProfile,
} from "@/db/entities/customer-profile.entity";
import {
  LoyaltyIdentityTokenEntity,
  type LoyaltyIdentityToken,
} from "@/db/entities/loyalty-identity-token.entity";
import {
  LoyaltyMembershipEntity,
  type LoyaltyMembership,
} from "@/db/entities/loyalty-membership.entity";
import {
  LoyaltyProgramEntity,
  type LoyaltyProgram,
} from "@/db/entities/loyalty-program.entity";
import { MerchantEntity, type Merchant } from "@/db/entities/merchant.entity";
import { RewardEntity, type Reward } from "@/db/entities/reward.entity";
import { UserEntity } from "@/db/entities/user.entity";
import { runInTransaction } from "@/db/transactions";
import { ConflictError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { formatMoney } from "@/lib/format";
import { parseInput } from "@/lib/schemas";

import {
  generateIdentityToken,
  identityQrPayload,
  parseIdentityQrPayload,
} from "./identity";
import { loyaltyProgress, type LoyaltyProgress } from "./progress";
import { profileFormSchema, type ProfileFormValues } from "./schemas";

/**
 * Customer enrollment and loyalty identity (checklist §7, PRD §14/§15/§24).
 *
 * Three responsibilities, in this order:
 *
 * 1. **Join target** — what a join URL resolves to: the merchant, its active
 *    program and a preview of the rewards. The slug is the only thing the
 *    link carries, so this lookup never exposes personal data.
 * 2. **Enrollment** — creates *or reuses* the platform identity
 *    (`customer_profile`), the per-merchant membership and the opaque card
 *    token, all inside one transaction. Every insert is
 *    `INSERT … ON CONFLICT DO NOTHING`, so repeated scans, double-clicks and
 *    two concurrent joins all converge on the same three rows instead of
 *    failing or duplicating (PRD §14). Nothing here ever trusts a
 *    client-supplied merchant id: the target comes from the slug, the
 *    identity from the session.
 * 3. **Reads** — the customer's own view of one membership (balance,
 *    progress, rewards, activity, offers, card), always filtered by the
 *    membership resolved server-side from the session. One customer in many
 *    merchants therefore sees exactly one program at a time, and can never
 *    reach another tenant's numbers through a crafted parameter
 *    (checklist §7 bullet 7).
 */

// ---------------------------------------------------------------------------
// Join target
// ---------------------------------------------------------------------------

export interface JoinTarget {
  merchant: Pick<
    Merchant,
    "id" | "name" | "slug" | "status" | "category" | "currency"
  >;
  program: LoyaltyProgram | null;
  /** A few active rewards so the visitor knows what they're joining. */
  rewards: Reward[];
  /** Whether enrollment is open (a suspended merchant refuses new joins). */
  open: boolean;
}

/** Resolves a public join slug to everything the join page renders. */
export async function resolveJoinTarget(
  slug: string,
): Promise<JoinTarget | null> {
  const db = await getDb();
  const merchant = await db.manager.findOne(MerchantEntity, {
    where: { slug },
  });
  if (!merchant) return null;

  const [program, rewards] = await Promise.all([
    db.manager.findOne(LoyaltyProgramEntity, {
      where: { merchantId: merchant.id, status: "active" },
    }),
    db.manager.find(RewardEntity, {
      where: { merchantId: merchant.id, status: "active" },
      order: { cost: "ASC" },
      take: 4,
    }),
  ]);

  const now = new Date();
  return {
    merchant: {
      id: merchant.id,
      name: merchant.name,
      slug: merchant.slug,
      status: merchant.status,
      category: merchant.category,
      currency: merchant.currency,
    },
    program,
    rewards: rewards.filter(
      (reward) => !reward.expiresAt || reward.expiresAt > now,
    ),
    open: merchant.status !== "suspended",
  };
}

/**
 * The signed-in visitor's membership at this merchant, if they already have
 * one — what the join page needs to offer "Open my card" instead of "Join".
 */
export async function findMembershipForUser(
  userId: string,
  merchantId: string,
): Promise<{ id: string; balance: number } | null> {
  const db = await getDb();
  const rows = await db.query<Array<{ id: string; balance: number }>>(
    `SELECT lm.id, lm.balance
       FROM loyalty_membership lm
       JOIN customer_profile cp ON cp.id = lm.customer_profile_id
      WHERE cp.user_id = $1
        AND lm.merchant_id = $2
        AND lm.status = 'active'`,
    [userId, merchantId],
  );
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Enrollment
// ---------------------------------------------------------------------------

export interface EnrollInput {
  userId: string;
  merchantId: string;
  /** Display name for a brand-new profile; an existing profile keeps its own. */
  name?: string | null;
  phone?: string | null;
}

export interface EnrollResult {
  merchantId: string;
  merchantName: string;
  profileId: string;
  membershipId: string;
  balance: number;
  /** The membership's active card token — existing or just issued. */
  token: string;
  createdProfile: boolean;
  createdMembership: boolean;
  createdToken: boolean;
}

/**
 * `INSERT … ON CONFLICT DO NOTHING … RETURNING id`, so a lost race reports
 * "someone else inserted it" instead of raising: inside a PostgreSQL
 * transaction a caught unique violation aborts the whole unit of work, which
 * is exactly what idempotency must not do. `null` means the row already
 * existed (or won the race) — the caller re-reads it either way.
 */
async function insertIgnoreId<T extends ObjectLiteral>(
  em: EntityManager,
  entity: EntitySchema<T>,
  values: QueryDeepPartialEntity<T>,
): Promise<string | null> {
  const result = await em
    .createQueryBuilder()
    .insert()
    .into(entity)
    .values(values)
    .orIgnore()
    .returning(["id"])
    .execute();
  const id = result.identifiers[0]?.id;
  return typeof id === "string" ? id : null;
}

/** The caller's profile row, created on first enrollment. */
async function ensureProfile(
  em: EntityManager,
  input: { userId: string; name?: string | null; phone?: string | null },
): Promise<{ row: CustomerProfile; created: boolean }> {
  const existing = await em.findOne(CustomerProfileEntity, {
    where: { userId: input.userId },
  });
  if (existing) return { row: existing, created: false };

  const id = await insertIgnoreId(em, CustomerProfileEntity, {
    userId: input.userId,
    name: input.name?.trim() || "Member",
    phone: input.phone?.trim() || null,
  });
  const row = await em.findOne(CustomerProfileEntity, {
    where: { userId: input.userId },
  });
  if (!row)
    throw new ConflictError(
      "Couldn't create your member profile. Please try again.",
    );
  return { row, created: id !== null };
}

/**
 * One membership per merchant per profile — the unique index does the work,
 * this only makes "join again" mean "same row". A membership a merchant
 * closed is reactivated on a fresh join (the balance is untouched), because
 * re-scanning a join link is an explicit request to be a member again.
 */
async function ensureMembership(
  em: EntityManager,
  input: { merchantId: string; profileId: string },
): Promise<{ row: LoyaltyMembership; created: boolean }> {
  const where = {
    merchantId: input.merchantId,
    customerProfileId: input.profileId,
  };
  const existing = await em.findOne(LoyaltyMembershipEntity, { where });
  if (existing) {
    if (existing.status !== "active") {
      // Targeted UPDATE: only `status` moves, so a concurrent ledger write to
      // `balance` can never be clobbered by a full-row save here.
      await em
        .createQueryBuilder()
        .update(LoyaltyMembershipEntity)
        .set({ status: "active" })
        .where("id = :id AND status = 'closed'", { id: existing.id })
        .execute();
    }
    const row = await em.findOne(LoyaltyMembershipEntity, { where });
    if (!row)
      throw new ConflictError(
        "Couldn't open your membership. Please try again.",
      );
    return { row, created: false };
  }

  const id = await insertIgnoreId(em, LoyaltyMembershipEntity, {
    merchantId: input.merchantId,
    customerProfileId: input.profileId,
    balance: 0,
    status: "active",
  });
  const row = await em.findOne(LoyaltyMembershipEntity, { where });
  if (!row)
    throw new ConflictError("Couldn't open your membership. Please try again.");
  return { row, created: id !== null };
}

/**
 * The opaque card token: at most one active per membership (partial unique
 * index), read back in the clear so the customer can re-open their own card
 * on every visit. Re-joining never mints a second card while one is live —
 * rotation is an explicit, audited action.
 */
async function ensureIdentityToken(
  em: EntityManager,
  input: {
    merchantId: string;
    profileId: string;
    membershipId: string;
    issuedTo: string | null;
  },
): Promise<{ row: LoyaltyIdentityToken; created: boolean }> {
  const where = { membershipId: input.membershipId, status: "active" as const };
  const existing = await em.findOne(LoyaltyIdentityTokenEntity, { where });
  if (existing) return { row: existing, created: false };

  const id = await insertIgnoreId(em, LoyaltyIdentityTokenEntity, {
    merchantId: input.merchantId,
    customerProfileId: input.profileId,
    membershipId: input.membershipId,
    token: generateIdentityToken(),
    status: "active",
    issuedTo: input.issuedTo,
  });
  const row = await em.findOne(LoyaltyIdentityTokenEntity, { where });
  if (!row)
    throw new ConflictError(
      "Couldn't issue your loyalty card. Please try again.",
    );
  return { row, created: id !== null };
}

/**
 * Creates-or-reuses profile + membership + token for one merchant inside the
 * caller's transaction. Safe to call twice for the same pair: the second call
 * reports `created*: false` and returns the very same rows.
 */
export async function enrollCustomer(
  em: EntityManager,
  input: EnrollInput,
): Promise<EnrollResult> {
  const merchant = await em.findOne(MerchantEntity, {
    where: { id: input.merchantId },
  });
  if (!merchant)
    throw new NotFoundError("That join link doesn't belong to a merchant.");
  if (merchant.status === "suspended") {
    throw new ConflictError(
      "This merchant isn't accepting new members right now.",
    );
  }

  const profile = await ensureProfile(em, {
    userId: input.userId,
    name: input.name,
    phone: input.phone,
  });
  const membership = await ensureMembership(em, {
    merchantId: merchant.id,
    profileId: profile.row.id,
  });
  const identity = await ensureIdentityToken(em, {
    merchantId: merchant.id,
    profileId: profile.row.id,
    membershipId: membership.row.id,
    issuedTo: input.userId,
  });

  return {
    merchantId: merchant.id,
    merchantName: merchant.name,
    profileId: profile.row.id,
    membershipId: membership.row.id,
    balance: membership.row.balance,
    token: identity.row.token,
    createdProfile: profile.created,
    createdMembership: membership.created,
    createdToken: identity.created,
  };
}

/** Enrollment from a public join slug — merchant resolved server-side. */
export async function enrollBySlug(input: {
  userId: string;
  slug: string;
  name?: string | null;
  phone?: string | null;
}): Promise<EnrollResult> {
  const db = await getDb();
  const merchant = await db.manager.findOne(MerchantEntity, {
    where: { slug: input.slug },
  });
  if (!merchant)
    throw new NotFoundError("That join link doesn't belong to a merchant.");

  return runInTransaction((em) =>
    enrollCustomer(em, {
      userId: input.userId,
      merchantId: merchant.id,
      name: input.name,
      phone: input.phone,
    }),
  );
}

// ---------------------------------------------------------------------------
// Identity token: rotation and lookup
// ---------------------------------------------------------------------------

export interface RotateIdentityResult {
  /** Row id of the token just issued — the audit trail's resource. */
  tokenId: string;
  token: string;
  revokedCount: number;
}

/**
 * Issues a fresh card for the active membership and revokes the live one in
 * the same transaction — a photographed old card stops resolving the moment
 * this commits (checklist §7 bullet 3).
 */
export async function rotateIdentityToken(input: {
  auth: AuthContext;
  merchantId: string;
}): Promise<RotateIdentityResult> {
  const { auth, merchantId } = input;
  if (auth.preview) {
    throw new ForbiddenError("Preview mode has no loyalty card to replace.");
  }

  return runInTransaction(async (em) => {
    const profile = await em.findOne(CustomerProfileEntity, {
      where: { userId: auth.userId },
    });
    if (!profile)
      throw new NotFoundError("You haven't joined a loyalty program yet.");

    const membership = await em.findOne(LoyaltyMembershipEntity, {
      where: { merchantId, customerProfileId: profile.id, status: "active" },
    });
    if (!membership) {
      throw new NotFoundError(
        "You don't have an active membership with this merchant.",
      );
    }

    const revoked = await em
      .createQueryBuilder()
      .update(LoyaltyIdentityTokenEntity)
      .set({ status: "revoked", revokedAt: new Date() })
      .where("membership_id = :membershipId AND status = 'active'", {
        membershipId: membership.id,
      })
      .execute();

    const identity = await ensureIdentityToken(em, {
      merchantId,
      profileId: profile.id,
      membershipId: membership.id,
      issuedTo: auth.userId,
    });

    return {
      tokenId: identity.row.id,
      token: identity.row.token,
      revokedCount: revoked.affected ?? 0,
    };
  });
}

export interface ResolvedIdentity {
  token: LoyaltyIdentityToken;
  membership: LoyaltyMembership;
  profile: CustomerProfile;
  merchant: Pick<Merchant, "id" | "name" | "slug" | "status">;
}

/**
 * Looks a member up from a scanned/typed QR payload (checklist §7 bullet 3).
 *
 * Pure parsing first — anything that is not `cofe://customer/<token>` (or a
 * bare token) returns `null` without touching the database — then one indexed
 * read of an *active* token, optionally narrowed to a merchant. Callers wrap
 * this in the `tokenResolve` rate limit; this function itself does no I/O
 * beyond the lookup, so §8 can reuse it verbatim.
 */
export async function resolveIdentityToken(
  payload: unknown,
  options: { merchantId?: string } = {},
): Promise<ResolvedIdentity | null> {
  const raw = parseIdentityQrPayload(payload);
  if (!raw) return null;

  const db = await getDb();
  const token = await db.manager.findOne(LoyaltyIdentityTokenEntity, {
    where: {
      token: raw,
      status: "active",
      ...(options.merchantId ? { merchantId: options.merchantId } : {}),
    },
  });
  if (!token) return null;

  const [membership, profile, merchant] = await Promise.all([
    db.manager.findOne(LoyaltyMembershipEntity, {
      where: { id: token.membershipId },
    }),
    db.manager.findOne(CustomerProfileEntity, {
      where: { id: token.customerProfileId },
    }),
    db.manager.findOne(MerchantEntity, { where: { id: token.merchantId } }),
  ]);
  if (!membership || !profile || !merchant) return null;

  return {
    token,
    membership,
    profile,
    merchant: {
      id: merchant.id,
      name: merchant.name,
      slug: merchant.slug,
      status: merchant.status,
    },
  };
}

// ---------------------------------------------------------------------------
// Customer views
// ---------------------------------------------------------------------------

export interface CustomerMerchant {
  id: string;
  name: string;
  slug: string;
  status: MerchantStatus;
  currency: string;
  timezone: string;
  logoUrl: string | null;
}

export interface CustomerMembershipSummary {
  merchantId: string;
  merchantName: string;
  balance: number;
  unit: string;
  programType: LoyaltyType | null;
  /** True for the membership this request is currently rendering. */
  active: boolean;
}

export interface CustomerContext {
  auth: AuthContext;
  /** The account's sign-in address — shown read-only on the profile page. */
  email: string | null;
  profile: CustomerProfile;
  merchant: CustomerMerchant;
  membership: {
    id: string;
    balance: number;
    status: LoyaltyMembershipStatus;
    createdAt: Date;
  };
  program: LoyaltyProgram | null;
  progress: LoyaltyProgress;
  /** Every membership this identity holds, for the switcher. */
  memberships: CustomerMembershipSummary[];
}

/**
 * What `/me` can render. `preview` and `empty` are real answers, not errors:
 * a dev-preview context has no rows, and a brand-new account has no
 * membership yet — both get an honest screen instead of a crash.
 */
export type CustomerViewState =
  | { kind: "preview" }
  | { kind: "empty"; userId: string }
  | { kind: "choose"; userId: string }
  | { kind: "ready"; ctx: CustomerContext };

interface ProfileRow {
  id: string;
  userId: string;
  name: string;
  phone: string | null;
  createdAt: Date;
  updatedAt: Date;
  email: string | null;
}

interface MembershipRow {
  membership_id: string;
  balance: number;
  membership_status: LoyaltyMembershipStatus;
  membership_created_at: Date;
  merchant_id: string;
  merchant_name: string;
  merchant_slug: string;
  merchant_status: MerchantStatus;
  currency: string;
  timezone: string;
  logo_url: string | null;
  program_type: LoyaltyType | null;
  unit_name: string | null;
}

/** The customer's memberships with their merchant and program unit — one query. */
async function listMembershipRows(userId: string): Promise<MembershipRow[]> {
  const db = await getDb();
  return db.query<MembershipRow[]>(
    `SELECT lm.id AS membership_id,
            lm.balance,
            lm.status AS membership_status,
            lm.created_at AS membership_created_at,
            m.id AS merchant_id,
            m.name AS merchant_name,
            m.slug AS merchant_slug,
            m.status AS merchant_status,
            m.currency,
            m.timezone,
            m.logo_url,
            p.type AS program_type,
            p.unit_name AS unit_name
       FROM loyalty_membership lm
       JOIN merchant m ON m.id = lm.merchant_id
       LEFT JOIN loyalty_program p ON p.merchant_id = m.id AND p.status = 'active'
      WHERE lm.customer_profile_id = (
        SELECT id FROM customer_profile WHERE user_id = $1
      )
        AND lm.status = 'active'
        AND m.status <> 'suspended'
      ORDER BY m.name ASC, m.id ASC`,
    [userId],
  );
}

async function loadProfileRow(userId: string): Promise<ProfileRow | null> {
  const db = await getDb();
  const rows = await db.query<ProfileRow[]>(
    `SELECT cp.id, cp.user_id AS "userId", cp.name, cp.phone,
            cp.created_at AS "createdAt", cp.updated_at AS "updatedAt", u.email
       FROM customer_profile cp
       JOIN "user" u ON u.id = cp.user_id
      WHERE cp.user_id = $1`,
    [userId],
  );
  return rows[0] ?? null;
}

function summarize(
  rows: MembershipRow[],
  activeMerchantId: string | null,
): CustomerMembershipSummary[] {
  return rows.map((row) => ({
    merchantId: row.merchant_id,
    merchantName: row.merchant_name,
    balance: row.balance,
    unit:
      row.unit_name ?? (row.program_type === "STAMPS" ? "stamps" : "points"),
    programType: row.program_type,
    active: row.merchant_id === activeMerchantId,
  }));
}

/**
 * Resolves the customer's view for this request: the active tenant comes from
 * the session (never the URL), and the states cover "not signed in as a
 * member yet" and "several memberships, none selected" explicitly so `/me`
 * can route instead of guessing.
 */
export async function loadCustomerContext(
  auth: AuthContext,
): Promise<CustomerViewState> {
  if (auth.preview) return { kind: "preview" };
  if (auth.role !== "CUSTOMER") {
    throw new ForbiddenError("This portal is for customer accounts.");
  }

  const [profile, rows] = await Promise.all([
    loadProfileRow(auth.userId),
    listMembershipRows(auth.userId),
  ]);
  if (!profile || rows.length === 0)
    return { kind: "empty", userId: auth.userId };
  if (!auth.merchantId) return { kind: "choose", userId: auth.userId };
  const active = rows.find((row) => row.merchant_id === auth.merchantId);
  if (!active) return { kind: "choose", userId: auth.userId };

  const db = await getDb();
  const program = await db.manager.findOne(LoyaltyProgramEntity, {
    where: { merchantId: active.merchant_id, status: "active" },
  });

  return {
    kind: "ready",
    ctx: {
      auth,
      email: profile.email,
      profile: {
        id: profile.id,
        userId: profile.userId,
        name: profile.name,
        phone: profile.phone,
        createdAt: profile.createdAt,
        updatedAt: profile.updatedAt,
      },
      merchant: {
        id: active.merchant_id,
        name: active.merchant_name,
        slug: active.merchant_slug,
        status: active.merchant_status,
        currency: active.currency,
        timezone: active.timezone,
        logoUrl: active.logo_url,
      },
      membership: {
        id: active.membership_id,
        balance: active.balance,
        status: active.membership_status,
        createdAt: active.membership_created_at,
      },
      program,
      progress: loyaltyProgress({
        balance: active.balance,
        type: program?.type ?? null,
        unitName: program?.unitName ?? null,
        configuration: program?.configuration ?? null,
      }),
      memberships: summarize(rows, auth.merchantId),
    },
  };
}

// ---------------------------------------------------------------------------
// Rewards, activity, offers and the loyalty card
// ---------------------------------------------------------------------------

export interface CustomerReward {
  id: string;
  name: string;
  description: string | null;
  terms: string | null;
  cost: number;
  unit: LoyaltyType;
  status: RewardStatus;
  expiresAt: Date | null;
  affordable: boolean;
  /** Units still needed when `affordable` is false (`null` when it is). */
  shortage: number | null;
}

/**
 * The program's rewards as the member sees them — active only, expired rows
 * dropped, ordered by cost so the reachable ones come first. Availability
 * limits (remaining stock, per-member caps) are §9's concern.
 */
export async function listCustomerRewards(
  ctx: CustomerContext,
  options: { limit?: number } = {},
): Promise<CustomerReward[]> {
  const db = await getDb();
  const now = new Date();
  const rewards = await db.manager.find(RewardEntity, {
    where: { merchantId: ctx.merchant.id, status: "active" },
    order: { cost: "ASC" },
  });

  return rewards
    .filter((reward) => !reward.expiresAt || reward.expiresAt > now)
    .slice(0, options.limit ?? rewards.length)
    .map((reward) => {
      const affordable = ctx.membership.balance >= reward.cost;
      return {
        id: reward.id,
        name: reward.name,
        description: reward.description,
        terms: reward.terms,
        cost: reward.cost,
        unit: reward.unit,
        status: reward.status,
        expiresAt: reward.expiresAt,
        affordable,
        shortage: affordable ? null : reward.cost - ctx.membership.balance,
      };
    });
}

export type ActivityGroup = "earn" | "redeem" | "adjustment";

const GROUP_TYPES: Record<ActivityGroup, readonly LedgerType[]> = {
  earn: ["POINTS_EARNED", "STAMP_EARNED"],
  redeem: ["POINTS_REDEEMED", "STAMP_REDEEMED", "REWARD_REDEEMED"],
  adjustment: ["POINTS_ADJUSTED", "STAMP_ADJUSTED"],
};

export const ACTIVITY_GROUPS = Object.keys(GROUP_TYPES) as ActivityGroup[];

export interface ActivityRow {
  id: string;
  createdAt: Date;
  type: LedgerType;
  group: ActivityGroup;
  delta: number;
  /** Signed amount in the program's own unit, e.g. `+45 pts`. */
  amountLabel: string;
  detail: string;
  subtitle: string | null;
}

interface ActivitySqlRow {
  id: string;
  created_at: Date;
  type: LedgerType;
  delta: number;
  purchase_amount: number | null;
  currency: string | null;
  reason: string | null;
  reward_name: string | null;
}

/**
 * The member's own ledger rows, newest first.
 *
 * Both `merchant_id` **and** `customer_profile_id` come from the resolved
 * context — never from the query string — so there is no parameter that could
 * widen the read to another member or another tenant. The projection exposes
 * a field-limited view (no actor ids, no idempotency keys, no raw metadata),
 * which is what "appropriate field-level data limits" means for the customer
 * side of §7/§8.
 */
export async function listCustomerActivity(
  ctx: CustomerContext,
  options: { group?: ActivityGroup; limit?: number } = {},
): Promise<ActivityRow[]> {
  const types = options.group ? [...GROUP_TYPES[options.group]] : null;
  const db = await getDb();
  const rows = await db.query<ActivitySqlRow[]>(
    `SELECT t.id, t.created_at, t.type, t.delta, t.purchase_amount,
            t.currency, t.reason, r.name AS reward_name
       FROM loyalty_transaction t
       LEFT JOIN reward r ON r.id = t.reward_id
      WHERE t.merchant_id = $1
        AND t.customer_profile_id = $2
        AND ($3::text[] IS NULL OR t.type = ANY($3::text[]))
      ORDER BY t.created_at DESC, t.id DESC
      LIMIT $4`,
    [ctx.merchant.id, ctx.profile.id, types, options.limit ?? 200],
  );

  return rows.map((row) => {
    const group = (Object.keys(GROUP_TYPES) as ActivityGroup[]).find((key) =>
      GROUP_TYPES[key].includes(row.type),
    ) as ActivityGroup;
    const detail = activityDetail(row);
    return {
      id: row.id,
      createdAt: row.created_at,
      type: row.type,
      group,
      delta: row.delta,
      amountLabel: signedAmount(row.delta, ctx.progress.unit),
      detail: detail.detail,
      subtitle: detail.subtitle,
    };
  });
}

function activityDetail(row: ActivitySqlRow): {
  detail: string;
  subtitle: string | null;
} {
  if (row.type === "REWARD_REDEEMED") {
    return { detail: row.reward_name ?? "Reward redeemed", subtitle: "Reward" };
  }
  if (row.type === "POINTS_ADJUSTED" || row.type === "STAMP_ADJUSTED") {
    return {
      detail: row.reason?.trim() || "Balance adjusted",
      subtitle: "Adjustment",
    };
  }
  return {
    detail:
      row.purchase_amount === null
        ? "Points awarded"
        : `Purchase · ${formatMoney(row.purchase_amount, row.currency ?? "USD")}`,
    subtitle: "Purchase",
  };
}

/** `+45 pts` / `-1 stamp` — the unit comes from the program, not a guess. */
function signedAmount(delta: number, unit: string): string {
  const sign = delta < 0 ? "-" : "+";
  return `${sign}${new Intl.NumberFormat("en-US").format(Math.abs(delta))} ${unit}`;
}

export interface OfferRow {
  id: string;
  name: string;
  description: string | null;
  terms: string | null;
  startAt: Date;
  endAt: Date;
  status: string;
  /** Whether the window is open right now (status alone can lag behind). */
  live: boolean;
}

/** Live and upcoming campaigns for this tenant; drafts and ended ones never appear. */
export async function listCustomerOffers(
  ctx: CustomerContext,
  options: { limit?: number } = {},
): Promise<OfferRow[]> {
  const db = await getDb();
  const now = new Date();
  const rows = await db.query<
    Array<{
      id: string;
      name: string;
      description: string | null;
      terms: string | null;
      start_at: Date;
      end_at: Date;
      status: string;
    }>
  >(
    `SELECT id, name, description, terms, start_at, end_at, status
       FROM campaign
      WHERE merchant_id = $1
        AND status IN ('ACTIVE', 'SCHEDULED')
        AND end_at >= now()
      ORDER BY start_at ASC, id ASC
      LIMIT $2`,
    [ctx.merchant.id, options.limit ?? 50],
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    terms: row.terms,
    startAt: row.start_at,
    endAt: row.end_at,
    status: row.status,
    live: row.start_at <= now && row.end_at >= now,
  }));
}

export interface IdentityCard {
  /** The opaque token itself — rendered only to its own authenticated owner. */
  token: string;
  payload: string;
  qrDataUrl: string;
  issuedAt: Date;
}

/**
 * The member's live card: payload + QR image, generated server-side from the
 * stored token so the picture can never disagree with what a scanner reads.
 */
export async function loadIdentityCard(
  ctx: CustomerContext,
): Promise<IdentityCard | null> {
  const db = await getDb();
  const row = await db.manager.findOne(LoyaltyIdentityTokenEntity, {
    where: { membershipId: ctx.membership.id, status: "active" },
  });
  if (!row) return null;

  const payload = identityQrPayload(row.token);
  const qrDataUrl = await QRCode.toDataURL(payload, {
    margin: 1,
    width: 320,
    color: { dark: "#0a0a0a", light: "#ffffff" },
  });
  return { token: row.token, payload, qrDataUrl, issuedAt: row.createdAt };
}

export interface CustomerOverview {
  identity: IdentityCard | null;
  rewards: CustomerReward[];
  affordable: CustomerReward[];
  recentActivity: ActivityRow[];
  offers: OfferRow[];
}

/** Everything the `/me` dashboard renders, in one place. */
export async function loadCustomerOverview(
  ctx: CustomerContext,
): Promise<CustomerOverview> {
  const [identity, rewards, recentActivity, offers] = await Promise.all([
    loadIdentityCard(ctx),
    listCustomerRewards(ctx),
    listCustomerActivity(ctx, { limit: 4 }),
    listCustomerOffers(ctx, { limit: 3 }),
  ]);
  return {
    identity,
    rewards,
    affordable: rewards.filter((reward) => reward.affordable).slice(0, 3),
    recentActivity,
    offers,
  };
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export interface ProfileView {
  userId: string;
  name: string;
  email: string | null;
  phone: string | null;
  /** True once a `customer_profile` row exists (i.e. they joined somewhere). */
  hasProfile: boolean;
  memberships: CustomerMembershipSummary[];
}

/**
 * The profile screen's data. Deliberately *not* tied to an active tenant:
 * contact details belong to the identity, so a customer with several
 * memberships (or none yet) still has one editable profile.
 */
export async function loadProfileView(auth: AuthContext): Promise<ProfileView> {
  if (auth.preview) {
    return {
      userId: auth.userId,
      name: auth.displayName,
      email: null,
      phone: null,
      hasProfile: false,
      memberships: [],
    };
  }

  const [profile, rows] = await Promise.all([
    loadProfileRow(auth.userId),
    listMembershipRows(auth.userId),
  ]);

  return {
    userId: auth.userId,
    name: profile?.name || auth.displayName,
    email: profile?.email ?? null,
    phone: profile?.phone ?? null,
    hasProfile: profile !== null,
    memberships: summarize(rows, auth.merchantId),
  };
}

export interface UpdateProfileResult {
  profile: CustomerProfile;
  changedFields: string[];
  created: boolean;
}

/**
 * Saves the customer's contact details (checklist §7 bullet 6).
 *
 * The profile row and the account's display name move together in one
 * transaction: they are the same "my name" to the customer, and leaving them
 * to drift would show two different names in the shell and on the card.
 * Email is deliberately not writable here — it is the sign-in identity and
 * changes through the auth flow only.
 */
export async function updateCustomerProfile(input: {
  auth: AuthContext;
  values: ProfileFormValues;
}): Promise<UpdateProfileResult> {
  if (input.auth.preview) {
    throw new ForbiddenError("Preview mode can't save profile changes.");
  }
  const values = parseInput(profileFormSchema, input.values);
  const name = values.name;
  const phone = values.phone.trim() || null;

  return runInTransaction(async (em) => {
    const existing = await em.findOne(CustomerProfileEntity, {
      where: { userId: input.auth.userId },
    });

    let profile: CustomerProfile;
    let changedFields: string[];
    let created = false;

    if (!existing) {
      const ensured = await ensureProfile(em, {
        userId: input.auth.userId,
        name,
        phone,
      });
      profile = ensured.row;
      changedFields = ["name", "phone"];
      created = true;
    } else {
      changedFields = [];
      if (existing.name !== name) {
        existing.name = name;
        changedFields.push("name");
      }
      if (existing.phone !== phone) {
        existing.phone = phone;
        changedFields.push("phone");
      }
      if (changedFields.length > 0) {
        existing.updatedAt = new Date();
        // Entities are `EntitySchema`s, so rows come back as plain objects:
        // the target must be passed explicitly or TypeORM can't tell what
        // `existing` is (`save(existing)` throws CannotDetermineEntityError).
        await em.save(CustomerProfileEntity, existing);
      }
      profile = existing;
    }

    // The account's display name follows the profile's: the shell header and
    // the member card must not disagree about who this is.
    if (changedFields.includes("name")) {
      await em
        .createQueryBuilder()
        .update(UserEntity)
        .set({ name })
        .where("id = :id", { id: input.auth.userId })
        .execute();
    }

    return { profile, changedFields, created };
  });
}

export async function listMerchantCustomers(merchantId: string, search?: string) {
  const { getDb } = await import("@/db/connection");
  const db = await getDb();
  let query = `
    SELECT cp.id, u.email, cp.name, lm.balance as points, lm.status as tier, lm.status, lm.updated_at as "lastActivityOn", lm.created_at as "joinedOn"
    FROM customer_profile cp
    JOIN loyalty_membership lm ON lm.customer_profile_id = cp.id
    JOIN "user" u ON u.id = cp.user_id
    WHERE lm.merchant_id = $1
  `;
  const params: any[] = [merchantId];
  if (search) {
    query += ` AND (u.email ILIKE $2 OR cp.name ILIKE $2)`;
    params.push(`%${search}%`);
  }
  return db.query(query, params);
}
