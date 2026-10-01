import { z } from "zod";

/**
 * Business profile for merchant onboarding and settings (checklist §6 bullet
 * 1, PRD §10). One schema serves both the onboarding "create" step and the
 * settings "edit" form; `status` is intentionally absent — it is owned by the
 * server (`trial` → `active` on activation, `suspended` only by the platform).
 *
 * Pure module: no database or request state, so forms, actions and the
 * progress checker all agree on what "profile complete" means.
 */

export const MERCHANT_CATEGORIES = [
  "cafe",
  "coffee",
  "restaurant",
  "bar",
  "bakery",
  "salon",
  "gym",
  "retail",
  "spa",
  "other",
] as const;
export type MerchantCategory = (typeof MERCHANT_CATEGORIES)[number];

export const MERCHANT_CATEGORY_LABELS: Record<MerchantCategory, string> = {
  cafe: "Café / coffee shop",
  coffee: "Coffee roastery / specialty",
  restaurant: "Restaurant",
  bar: "Bar / nightlife",
  bakery: "Bakery",
  salon: "Salon / barbershop",
  gym: "Gym / fitness",
  retail: "Retail / local shop",
  spa: "Spa / wellness",
  other: "Other local business",
};

export const MERCHANT_CURRENCIES = [
  "EUR",
  "USD",
  "GBP",
  "CHF",
  "CAD",
  "AUD",
  "MAD",
  "AED",
  "SAR",
  "JPY",
] as const;

/**
 * A curated timezone list for the select. The server accepts any syntactic
 * IANA identifier (see `timezonePattern`), so a zone missing from this list
 * is still accepted when editing an existing profile.
 */
export const MERCHANT_TIMEZONES = [
  "UTC",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Amsterdam",
  "Europe/Brussels",
  "Europe/Lisbon",
  "Europe/Zurich",
  "Europe/Vienna",
  "Europe/Prague",
  "Europe/Warsaw",
  "Europe/Stockholm",
  "Europe/Oslo",
  "Europe/Copenhagen",
  "Europe/Helsinki",
  "Europe/Athens",
  "Europe/Bucharest",
  "Europe/Istanbul",
  "Europe/Moscow",
  "Africa/Casablanca",
  "Africa/Cairo",
  "Africa/Lagos",
  "Africa/Nairobi",
  "Africa/Johannesburg",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Vancouver",
  "America/Mexico_City",
  "America/Sao_Paulo",
  "America/Argentina/Buenos_Aires",
  "Asia/Dubai",
  "Asia/Riyadh",
  "Asia/Kuwait",
  "Asia/Qatar",
  "Asia/Jerusalem",
  "Asia/Kolkata",
  "Asia/Karachi",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Hong_Kong",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Pacific/Auckland",
] as const;

/**
 * Syntactic check only (`Area/City`, `Area/Sub/City` or bare `UTC`). The
 * database also enforces non-blank; validating against the live ICU database
 * instead would tie acceptance to the exact CLDR version of the server.
 */
const TIMEZONE_PATTERN = /^[A-Za-z][A-Za-z0-9_+\-]*(?:\/[A-Za-z0-9_+\-]+)*$/;

const websiteField = z
  .string()
  .trim()
  .max(500, "Keep the URL to 500 characters or fewer.")
  .refine((value) => value === "" || URL.canParse(value), {
    message: "Enter a valid URL, e.g. https://example.com.",
  });

/**
 * Any uppercase 3-letter code — the same shape the `ck_merchant_currency`
 * CHECK accepts. The curated `MERCHANT_CURRENCIES` list drives the *select*,
 * so unusual-but-valid currencies on existing rows can be displayed and kept
 * instead of being coerced into a default on the next save.
 */
const currencyField = z
  .string()
  .trim()
  .regex(/^[A-Z]{3}$/, "Pick the currency you charge in.");

export const businessProfileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Business name must be at least 2 characters.")
    .max(200, "Keep the name to 200 characters or fewer."),
  category: z.enum(
    MERCHANT_CATEGORIES,
    "Pick the category that fits your business.",
  ),
  description: z
    .string()
    .trim()
    .max(600, "Keep the description to 600 characters or fewer."),
  email: z.email("Enter a valid contact email address."),
  phone: z.string().trim().max(40, "That phone number looks too long."),
  website: websiteField,
  address: z
    .string()
    .trim()
    .min(3, "Enter the business address.")
    .max(500, "Keep the address to 500 characters or fewer."),
  currency: currencyField,
  timezone: z
    .string()
    .trim()
    .min(1, "Pick a timezone.")
    .max(64, "That timezone looks too long.")
    .regex(TIMEZONE_PATTERN, "Pick a timezone like Europe/Berlin."),
  logoUrl: websiteField,
});

export type BusinessProfileValues = z.infer<typeof businessProfileSchema>;

export function emptyBusinessProfileValues(): BusinessProfileValues {
  return {
    name: "",
    category: "cafe",
    description: "",
    email: "",
    phone: "",
    website: "",
    address: "",
    currency: "EUR",
    timezone: "Europe/London",
    logoUrl: "",
  };
}

/** Form defaults for an existing merchant row (edit forms). */
export function businessProfileValues(merchant: {
  name: string;
  category: string | null;
  description: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  currency: string;
  timezone: string;
  logoUrl: string | null;
}): BusinessProfileValues {
  const category = MERCHANT_CATEGORIES.find(
    (candidate) => candidate === merchant.category,
  );
  return {
    name: merchant.name,
    // An unknown legacy category can't be represented by the select; keep the
    // row visible by falling back to "other" (the user confirms on save).
    category: category ?? "other",
    description: merchant.description ?? "",
    email: merchant.email ?? "",
    phone: merchant.phone ?? "",
    website: merchant.website ?? "",
    address: merchant.address ?? "",
    currency: merchant.currency,
    timezone: merchant.timezone,
    logoUrl: merchant.logoUrl ?? "",
  };
}

/**
 * What the database row must contain for the business-profile step to count
 * as done (checklist §6 bullet 8). Optional contact channels (phone, website,
 * description, logo) never block onboarding.
 */
export function isProfileComplete(merchant: {
  name: string | null;
  category: string | null;
  email: string | null;
  address: string | null;
  currency: string | null;
  timezone: string | null;
}): boolean {
  return Boolean(
    merchant.name?.trim() &&
    merchant.category &&
    merchant.email?.trim() &&
    merchant.address?.trim() &&
    merchant.currency?.trim() &&
    merchant.timezone?.trim(),
  );
}

/**
 * URL-safe slug for the join link (`/join/<slug>`). Diacritics are folded to
 * ASCII first so "Café Zéro" becomes `cafe-zero`, then everything outside
 * `a-z0-9` collapses to single hyphens.
 */
export function slugify(name: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
  return base || "business";
}
