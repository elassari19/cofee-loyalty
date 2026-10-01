/**
 * Provider-neutral POS (Point of Sale) integration adapter (checklist §12 —
 * "Define POS transaction mapping, external reference uniqueness, duplicate
 * detection, correction/reversal, and reconciliation contracts. Keep payment
 * processing out of scope").
 *
 * Architecture contract:
 *
 * - A POS event is any external purchase/transaction event that should trigger
 *   loyalty earning. The adapter translates the provider's wire format into a
 *   `CanonicalPosTransaction` and hands it to the loyalty service.
 * - The loyalty service is the **sole authority** for earning rules,
 *   authorization, and ledger writes. A POS adapter may never write loyalty
 *   balances directly.
 * - External reference uniqueness is enforced by `loyalty_transaction.external_ref`
 *   (UNIQUE per merchant), so duplicate POS events are safely idempotent.
 * - Correction and reversal events from the POS are translated into
 *   `POINTS_ADJUSTED`/`STAMP_ADJUSTED` entries via the same loyalty service.
 * - Payment amount, card numbers, and payment processing logic are NOT handled
 *   here and must never flow into the loyalty ledger.
 *
 * What is NOT here (Phase 1 non-goals):
 *   - Square, Toast, Lightspeed, or any concrete POS credentials
 *   - Real-time POS webhook registration
 *   - Payment processing, refunds, or authorization
 */

import { getLogger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// POS provider types
// ---------------------------------------------------------------------------

export const POS_PROVIDERS = ["square", "toast", "lightspeed", "generic"] as const;
export type PosProvider = (typeof POS_PROVIDERS)[number];

// ---------------------------------------------------------------------------
// Canonical POS transaction (provider-agnostic)
// ---------------------------------------------------------------------------

export const POS_TRANSACTION_KINDS = [
  "PURCHASE",
  "CORRECTION",
  "REVERSAL",
] as const;
export type PosTransactionKind = (typeof POS_TRANSACTION_KINDS)[number];

/**
 * The provider-neutral representation of a POS transaction after adapter
 * translation. This is what the loyalty service receives — it contains no
 * payment card data, no customer PII beyond the platform's own IDs.
 *
 * Fields:
 *   - `externalRef`: the POS provider's own transaction ID, persisted in
 *     `loyalty_transaction.external_ref` to prevent double-earning.
 *   - `originalExternalRef`: for CORRECTION/REVERSAL, the externalRef of the
 *     row being corrected; the loyalty service will locate and reverse it.
 *   - `purchaseAmount`: the monetary amount that drives point/stamp
 *     calculation. In the merchant's configured currency. Always positive
 *     for PURCHASE; the sign is determined by `kind`.
 *   - `currency`: ISO-4217 three-letter code, must match merchant config.
 *   - `occurredAt`: the POS timestamp (may differ from ingest time for
 *     delayed/offline syncs). ISO-8601 with timezone.
 */
export interface CanonicalPosTransaction {
  /** Platform ID of the merchant this transaction belongs to. */
  merchantId: string;
  /** Platform ID of the customer (resolved by the adapter from the POS lookup). */
  customerProfileId: string;
  kind: PosTransactionKind;
  externalRef: string;
  /** Only set for CORRECTION/REVERSAL. */
  originalExternalRef?: string;
  /** Positive monetary amount in the merchant's currency. */
  purchaseAmount: number;
  currency: string;
  /** ISO-8601, provider timestamp. */
  occurredAt: string;
  /** Opaque provider metadata — stored in `loyalty_transaction.metadata`. */
  providerMetadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Reconciliation contract
// ---------------------------------------------------------------------------

/**
 * Result of a reconciliation check between POS records and the loyalty ledger.
 * Run periodically to detect missed, duplicate, or mismatched entries.
 *
 * A future reconciliation job compares `externalRef` values in a time window
 * and emits one `ReconciliationReport` per merchant per run.
 */
export interface ReconciliationReport {
  merchantId: string;
  provider: PosProvider;
  /** ISO-8601 window start */
  windowStart: string;
  /** ISO-8601 window end */
  windowEnd: string;
  generatedAt: string;
  /** POS events with no matching loyalty_transaction.external_ref. */
  missing: string[];
  /** loyalty_transaction rows whose external_ref has no POS counterpart. */
  orphaned: string[];
  /** POS events where the amount on record differs from ledger delta calculation. */
  mismatched: Array<{
    externalRef: string;
    posAmount: number;
    loyaltyDelta: number;
  }>;
}

// ---------------------------------------------------------------------------
// Adapter interface
// ---------------------------------------------------------------------------

/**
 * Contract all POS adapters must satisfy.
 *
 * Rules:
 *   1. `parseInboundEvent` must strip all payment card data and PII before
 *      returning the `CanonicalPosTransaction`. The returned struct is safe
 *      to log (excluding `providerMetadata` which is opaque).
 *   2. `resolveCustomer` must return the platform `customerProfileId` or
 *      throw `NotFoundError`. It must NOT create a new customer — customer
 *      creation remains a platform-controlled flow.
 *   3. `fetchReconciliationWindow` fetches the POS provider's records for a
 *      time window so the reconciliation job can compare them against the
 *      ledger. Returns only the `externalRef` list (no card data).
 *   4. Adapters must authenticate every inbound webhook with the provider's
 *      signature scheme before calling `parseInboundEvent`.
 */
export interface PosAdapter {
  readonly provider: PosProvider;

  /**
   * Translates a raw provider webhook/poll payload into a canonical
   * transaction. Throws `ValidationError` for malformed payloads.
   *
   * @param merchantId - The platform merchant ID (resolved from routing config
   *   before this call, never extracted from the payload itself).
   * @param rawPayload - The provider's raw event body (JSON-decoded).
   */
  parseInboundEvent(
    merchantId: string,
    rawPayload: unknown,
  ): Promise<CanonicalPosTransaction>;

  /**
   * Looks up the platform `customerProfileId` for a POS customer identifier.
   * Uses `integration_record` to map `externalId` → `entity_id`.
   *
   * Returns null when the POS customer has not yet joined the loyalty program
   * (earn should be skipped, not failed).
   */
  resolveCustomer(
    merchantId: string,
    posCustomerId: string,
  ): Promise<string | null>;

  /**
   * Fetches the provider's list of transaction `externalRef` values in a
   * time window — used by the reconciliation job. Must NOT include amounts,
   * card numbers, or PII in the returned list.
   */
  fetchReconciliationWindow(
    merchantId: string,
    windowStart: Date,
    windowEnd: Date,
  ): Promise<string[]>;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const adapters = new Map<PosProvider, PosAdapter>();

/** Install a concrete POS adapter (called during bootstrap). */
export function registerPosAdapter(adapter: PosAdapter): void {
  adapters.set(adapter.provider, adapter);
  getLogger().info({ provider: adapter.provider }, "POS adapter registered");
}

/** Return the adapter for a provider, or undefined. */
export function getPosAdapter(provider: PosProvider): PosAdapter | undefined {
  return adapters.get(provider);
}

/** All POS providers with a registered adapter. */
export function registeredPosProviders(): PosProvider[] {
  return [...adapters.keys()];
}

// ---------------------------------------------------------------------------
// No-op stub (Phase 1)
// ---------------------------------------------------------------------------

/**
 * Stub POS adapter: validates the presence of required fields and logs.
 * Used so integration paths can be exercised in tests without a real POS.
 */
export class StubPosAdapter implements PosAdapter {
  readonly provider: PosProvider = "generic";

  async parseInboundEvent(
    merchantId: string,
    rawPayload: unknown,
  ): Promise<CanonicalPosTransaction> {
    // Minimal contract check — a real adapter would validate the signature first.
    if (typeof rawPayload !== "object" || rawPayload === null) {
      throw new Error("POS payload must be a JSON object.");
    }
    const p = rawPayload as Record<string, unknown>;
    if (
      typeof p["externalRef"] !== "string" ||
      typeof p["purchaseAmount"] !== "number" ||
      typeof p["currency"] !== "string" ||
      typeof p["customerProfileId"] !== "string" ||
      typeof p["occurredAt"] !== "string"
    ) {
      throw new Error(
        "Stub POS adapter requires externalRef, purchaseAmount, currency, customerProfileId, occurredAt.",
      );
    }
    const kind = (p["kind"] as PosTransactionKind | undefined) ?? "PURCHASE";
    return {
      merchantId,
      customerProfileId: p["customerProfileId"] as string,
      kind,
      externalRef: p["externalRef"] as string,
      originalExternalRef: p["originalExternalRef"] as string | undefined,
      purchaseAmount: p["purchaseAmount"] as number,
      currency: p["currency"] as string,
      occurredAt: p["occurredAt"] as string,
      providerMetadata: {},
    };
  }

  async resolveCustomer(
    _merchantId: string,
    _posCustomerId: string,
  ): Promise<string | null> {
    getLogger().debug(
      { posCustomerId: _posCustomerId },
      "stub POS adapter: resolveCustomer (no-op, returns null)",
    );
    return null;
  }

  async fetchReconciliationWindow(
    merchantId: string,
    windowStart: Date,
    windowEnd: Date,
  ): Promise<string[]> {
    getLogger().debug(
      { merchantId, windowStart, windowEnd },
      "stub POS adapter: fetchReconciliationWindow (no-op, returns [])",
    );
    return [];
  }
}
