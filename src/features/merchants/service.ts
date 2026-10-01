import type { EntityManager } from "typeorm";

import type { AuthContext } from "@/auth/context";
import type { Merchant } from "@/db/entities/merchant.entity";
import { MerchantEntity } from "@/db/entities/merchant.entity";
import { MerchantMembershipEntity } from "@/db/entities/merchant-membership.entity";
import { UserEntity } from "@/db/entities/user.entity";
import { runInTransaction } from "@/db/transactions";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { parseInput } from "@/lib/schemas";

import {
  businessProfileSchema,
  slugify,
  type BusinessProfileValues,
} from "./schemas";

/**
 * Merchant registration and profile service (checklist §6 bullet 1, PRD §9/§10).
 *
 * Registration is the one write that *creates a tenant*, so it runs in a
 * single transaction with everything that must exist alongside the row:
 * the owner's membership, and — for a customer registering their first
 * business — the platform-role promotion that lets the same identity operate
 * the merchant shell. A half-created business (row without an owner, or an
 * owner without a workspace) cannot occur.
 *
 * `slug` is generated once at creation and never regenerated: it is the public
 * join URL (`/join/<slug>`), so renaming the business must not break QR codes
 * customers already scanned.
 */

export interface CreateBusinessInput {
  auth: AuthContext;
  values: BusinessProfileValues;
}

export interface CreateBusinessResult {
  merchantId: string;
  slug: string;
  /** True when this call promoted the platform role CUSTOMER → MERCHANT. */
  promotedUser: boolean;
}

export async function createBusiness(
  input: CreateBusinessInput,
): Promise<CreateBusinessResult> {
  const { auth } = input;
  if (auth.preview) {
    // Preview contexts carry a synthetic id that exists in no `user` row; a
    // foreign-key failure would be a confusing way to learn that.
    throw new ForbiddenError(
      "Preview mode can't register a business. Sign in and try again.",
    );
  }
  const values = parseInput(businessProfileSchema, input.values);

  const result = await runInTransaction(async (em) => {
    const slug = await nextAvailableSlug(em, slugify(values.name));
    const merchant = em.create(MerchantEntity, {
      name: values.name,
      slug,
      logoUrl: values.logoUrl || null,
      description: values.description || null,
      category: values.category,
      address: values.address,
      phone: values.phone || null,
      email: values.email,
      website: values.website || null,
      currency: values.currency,
      timezone: values.timezone,
      status: "trial",
    });
    await em.save(MerchantEntity, merchant);

    em.insert(MerchantMembershipEntity, {
      merchantId: merchant.id,
      userId: auth.userId,
      role: "MERCHANT_OWNER",
      status: "active",
    });

    // A platform CUSTOMER gains a workspace: promote to MERCHANT so the next
    // request resolves the merchant shell. Existing customer memberships stay
    // untouched — only the routing role changes (audited by the action).
    let promotedUser = false;
    if (auth.role === "CUSTOMER") {
      await em.update(UserEntity, { id: auth.userId }, { role: "MERCHANT" });
      promotedUser = true;
    }

    return { merchantId: merchant.id, slug, promotedUser };
  });

  return result;
}

export interface UpdateProfileInput {
  merchantId: string;
  values: BusinessProfileValues;
}

export interface UpdateProfileResult {
  merchant: Merchant;
  /** Column names whose value actually changed — recorded in the audit row. */
  changedFields: string[];
}

/**
 * Updates the business profile in place. `slug` and `status` are never
 * accepted from the payload: the join URL stays stable and status is owned by
 * the server (`trial` → `active` on activation, `suspended` only by the
 * platform).
 */
export async function updateBusinessProfile(
  em: EntityManager,
  input: UpdateProfileInput,
): Promise<UpdateProfileResult> {
  const values = parseInput(businessProfileSchema, input.values);
  const merchant = await em.findOneBy(MerchantEntity, {
    id: input.merchantId,
  });
  if (!merchant) throw new NotFoundError("That business was not found.");

  const before: Record<string, string | null> = {
    name: merchant.name,
    category: merchant.category,
    description: merchant.description,
    email: merchant.email,
    phone: merchant.phone,
    website: merchant.website,
    address: merchant.address,
    currency: merchant.currency,
    timezone: merchant.timezone,
    logoUrl: merchant.logoUrl,
  };

  merchant.name = values.name;
  merchant.category = values.category;
  merchant.description = values.description || null;
  merchant.email = values.email;
  merchant.phone = values.phone || null;
  merchant.website = values.website || null;
  merchant.address = values.address;
  merchant.currency = values.currency;
  merchant.timezone = values.timezone;
  merchant.logoUrl = values.logoUrl || null;

  const after: Record<string, string | null> = {
    name: merchant.name,
    category: merchant.category,
    description: merchant.description,
    email: merchant.email,
    phone: merchant.phone,
    website: merchant.website,
    address: merchant.address,
    currency: merchant.currency,
    timezone: merchant.timezone,
    logoUrl: merchant.logoUrl,
  };
  const changedFields = Object.keys(before).filter(
    (key) => before[key] !== after[key],
  );

  const saved = await em.save(MerchantEntity, merchant);
  return { merchant: saved, changedFields };
}

/**
 * Launch activation: `trial` → `active`. Suspended tenants are refused, and
 * an already-active merchant is a no-op so retries stay safe. Runs inside the
 * activation transaction, next to `activateLoyaltyProgram`.
 */
export async function activateMerchantForLaunch(
  em: EntityManager,
  merchantId: string,
): Promise<Merchant> {
  const merchant = await em.findOneBy(MerchantEntity, { id: merchantId });
  if (!merchant) throw new NotFoundError("That business was not found.");
  if (merchant.status === "suspended") {
    throw new ForbiddenError("This business is suspended and can't launch.");
  }
  if (merchant.status !== "active") {
    merchant.status = "active";
    await em.save(MerchantEntity, merchant);
  }
  return merchant;
}

/**
 * First unused slug: `<base>`, `<base>-2`, `<base>-3`… The check runs inside
 * the registration transaction, and `uq_merchant_slug` remains the final word
 * if two registrations race.
 */
async function nextAvailableSlug(
  em: EntityManager,
  base: string,
): Promise<string> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const taken = await em.findOne(MerchantEntity, {
      where: { slug: candidate },
      select: { id: true },
    });
    if (!taken) return candidate;
  }
  // Exhausted the readable range — fall back to a suffix the race window
  // makes effectively unique; the unique index still rejects a true collision.
  return `${base}-${Date.now().toString(36)}`;
}
