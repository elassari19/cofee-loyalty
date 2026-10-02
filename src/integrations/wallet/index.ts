/**
 * Provider-neutral Wallet pass adapters (checklist §12 — "Keep Apple Wallet
 * and Google Wallet pass state behind adapters linked to stable loyalty
 * membership identifiers; do not add Wallet-specific logic to customer,
 * reward, or transaction core models").
 *
 * Architecture contract:
 *
 * - The adapter only ever receives stable platform identifiers: the
 *   `loyaltyMembershipId` is the one permanent join between a customer's
 *   platform account and a specific merchant program. Wallet-specific serial
 *   numbers, pass-type identifiers, and authentication tokens live entirely
 *   inside the integration record and the adapter's own state.
 * - Balance, merchant name, reward list, and expiry shown on the pass are
 *   pulled from the loyalty core through the `WalletPassData` interface.
 *   The adapter must not query the database directly.
 * - Pass updates are triggered by domain events (`loyalty.transaction.created`,
 *   `reward.redeemed`) emitted from the loyalty core. The wallet handler
 *   calls `updatePass()` from its outbox handler — it does not mutate the
 *   ledger.
 * - Concrete providers are future work. Phase 1 ships a no-op stub that logs
 *   calls without issuing a real pass.
 *
 * What is NOT here (Phase 1 non-goals):
 *   - Apple Pass Type ID / certificates / private keys
 *   - Google Pay API credentials / JWT signing
 *   - Actual .pkpass generation
 *   - Push notification to update passes on device
 */

import { getLogger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Wallet provider types
// ---------------------------------------------------------------------------

export const WALLET_PROVIDERS = ["apple", "google"] as const;
export type WalletProvider = (typeof WALLET_PROVIDERS)[number];

// ---------------------------------------------------------------------------
// Pass data (pulled from loyalty core, passed into adapter)
// ---------------------------------------------------------------------------

/**
 * The minimum loyalty data the adapter needs to render a pass.
 *
 * Populated by the caller from the loyalty core — the adapter never touches
 * the loyalty database directly.
 */
export interface WalletPassData {
  loyaltyMembershipId: string;
  merchantId: string;
  /** Human-readable merchant name shown on the pass. */
  merchantName: string;
  loyaltyType: "POINTS" | "STAMPS";
  /** Current balance (points count or stamps count). */
  balance: number;
  /** Unit label, e.g. "points", "stamps", "Stars". */
  unitName: string;
  /** ISO-4217 currency code the program operates in. */
  currency: string;
  /** Summary of the next reachable reward, for secondary field. */
  nextRewardLabel?: string;
  /** ISO-8601 pass expiry, if the program has one. */
  expiresAt?: string;
}

// ---------------------------------------------------------------------------
// Pass state
// ---------------------------------------------------------------------------

export interface WalletPassReference {
  provider: WalletProvider;
  loyaltyMembershipId: string;
  merchantId: string;
  /**
   * Provider-assigned serial / object ID stored in `integration_record`
   * so the adapter can correlate future updates and device registrations.
   */
  providerPassId: string;
  /**
   * URL or data blob the customer can open in their Wallet app. Stored
   * temporarily — do not persist in the loyalty core tables.
   */
  passUrl: string;
  issuedAt: string;
}

// ---------------------------------------------------------------------------
// Adapter interface
// ---------------------------------------------------------------------------

/**
 * Contract all Wallet adapters must satisfy.
 *
 * Rules:
 *   1. Adapters receive only `loyaltyMembershipId` as the stable identity
 *      link — never a raw customer email, phone, or name.
 *   2. `issuePass` must write the returned `providerPassId` to
 *      `integration_record` before returning so the platform can correlate
 *      future device registration webhooks.
 *   3. `updatePass` is idempotent: calling it twice with the same `data`
 *      must not issue a duplicate push or create a duplicate pass object.
 *   4. `revokePass` removes the pass from the customer's device; the
 *      corresponding `integration_record` row should be marked `revoked`
 *      by the caller after this succeeds.
 */
export interface WalletAdapter {
  readonly provider: WalletProvider;

  /**
   * Issues a new pass for the given membership.
   *
   * Returns the `WalletPassReference` the caller should persist in
   * `integration_record` (entity_type: `loyalty_membership`).
   */
  issuePass(data: WalletPassData): Promise<WalletPassReference>;

  /**
   * Pushes a balance/state update to an existing pass.
   *
   * `providerPassId` is looked up from `integration_record` by the caller
   * before invoking this method.
   */
  updatePass(providerPassId: string, data: WalletPassData): Promise<void>;

  /**
   * Revokes a pass. Called when a customer closes their membership or
   * requests their data to be deleted.
   */
  revokePass(providerPassId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const adapters = new Map<WalletProvider, WalletAdapter>();

/** Install a concrete wallet adapter (called during bootstrap). */
export function registerWalletAdapter(adapter: WalletAdapter): void {
  adapters.set(adapter.provider, adapter);
  getLogger().info({ provider: adapter.provider }, "wallet adapter registered");
}

/** Return the adapter for a provider, or undefined if not configured. */
export function getWalletAdapter(
  provider: WalletProvider,
): WalletAdapter | undefined {
  return adapters.get(provider);
}

/** All providers that have a registered adapter. */
export function registeredWalletProviders(): WalletProvider[] {
  return [...adapters.keys()];
}

// ---------------------------------------------------------------------------
// No-op stub (Phase 1)
// ---------------------------------------------------------------------------

/**
 * Stub adapter: logs calls, returns synthetic references, does nothing real.
 *
 * Swapping in the real Apple or Google adapter is a single
 * `registerWalletAdapter(new AppleWalletAdapter(...))` call — no platform
 * code changes needed.
 */
class StubWalletAdapter implements WalletAdapter {
  constructor(readonly provider: WalletProvider) {}

  async issuePass(data: WalletPassData): Promise<WalletPassReference> {
    const providerPassId = `stub-${this.provider}:${data.loyaltyMembershipId}`;
    getLogger().debug(
      {
        provider: this.provider,
        loyaltyMembershipId: data.loyaltyMembershipId,
        merchantId: data.merchantId,
      },
      "stub wallet adapter: issuePass (no-op)",
    );
    return {
      provider: this.provider,
      loyaltyMembershipId: data.loyaltyMembershipId,
      merchantId: data.merchantId,
      providerPassId,
      passUrl: `stub://${this.provider}/passes/${providerPassId}`,
      issuedAt: new Date().toISOString(),
    };
  }

  async updatePass(
    providerPassId: string,
    data: WalletPassData,
  ): Promise<void> {
    getLogger().debug(
      { provider: this.provider, providerPassId, balance: data.balance },
      "stub wallet adapter: updatePass (no-op)",
    );
  }

  async revokePass(providerPassId: string): Promise<void> {
    getLogger().debug(
      { provider: this.provider, providerPassId },
      "stub wallet adapter: revokePass (no-op)",
    );
  }
}

// Register stubs for all providers so the registry is never empty.
for (const provider of WALLET_PROVIDERS) {
  adapters.set(provider, new StubWalletAdapter(provider));
}
