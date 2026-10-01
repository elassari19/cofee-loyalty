/**
 * AI and predictive analytics governance boundary (checklist §12 —
 * "Define a governed analytics boundary for future AI and predictive models:
 * tenant-scoped data, minimization, retention, access logging, and no
 * cross-tenant model use without explicit authorization and legal basis.
 * Require AI output to be advisory by default, with review and normal
 * business-rule authorization before actions; AI cannot directly alter
 * balances, redeem rewards, or publish campaigns").
 *
 * Architecture contract:
 *
 * - AI/ML inference runs in a **separately deployable module** (future work).
 *   This file defines the interfaces the loyalty core exposes to it and the
 *   guardrails the module must satisfy.
 * - Analytical datasets are NEVER read from the operational tables directly
 *   by the AI service. Data is exported through explicit, tenant-scoped,
 *   minimized contracts (see `AnalyticsExportContract`).
 * - All AI output is advisory (`AnalyticsInsight`). The insight MUST pass
 *   through normal business-rule authorization before any action is taken.
 * - Cross-tenant data use is forbidden unless explicitly authorized per
 *   merchant and legally permitted (see `CrossTenantAuthorizationRecord`).
 * - Every AI data access is logged (`AnalyticsAccessRecord`) for audit.
 *
 * Phase 1 ships NO AI or predictive analytics. This module defines:
 *   - The tenant-scoped data export contract
 *   - The insight interface (advisory-only)
 *   - The access logging contract
 *   - A no-op stub provider
 *
 * What is NOT here (Phase 1 non-goals):
 *   - Model training pipelines
 *   - Embeddings or vector databases
 *   - Recommendation engine
 *   - Predictive churn scores
 *   - AI-generated campaign content
 */

import { getLogger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Insight types (advisory output)
// ---------------------------------------------------------------------------

/** Closed set of insight kinds Phase 1 reserves for future AI output. */
export const INSIGHT_KINDS = [
  /** Predicted churn risk for a customer segment. */
  "churn_risk",
  /** Suggested next best action for a customer. */
  "next_best_action",
  /** Campaign audience recommendation. */
  "campaign_audience",
  /** Reward recommendation for a customer. */
  "reward_recommendation",
] as const;
export type InsightKind = (typeof INSIGHT_KINDS)[number];

/**
 * An AI-generated insight — always advisory, never an action.
 *
 * Calling code MUST treat this as a recommendation. Any resulting platform
 * action (e.g. publishing a campaign, awarding points) must go through the
 * normal authorization + business-rule path. The AI module may not invoke
 * loyalty service methods directly.
 */
export interface AnalyticsInsight {
  id: string;
  merchantId: string;
  kind: InsightKind;
  /**
   * Confidence score [0, 1]. Action-gating thresholds are defined by the
   * calling feature, not by this interface.
   */
  confidence: number;
  /**
   * Human-readable label for the insight. Shown as-is in the UI so it must
   * be safe for display (no raw model output that could inject content).
   */
  label: string;
  /**
   * Opaque recommendation payload. Callers validate this against their own
   * schema before acting. Never contains PII or raw customer identifiers
   * beyond the platform's own stable IDs.
   */
  recommendation: Record<string, unknown>;
  /** ISO-8601. */
  generatedAt: string;
  /**
   * Non-AI fallback: the insight source, so callers know whether this is a
   * model output or a rule-based heuristic.
   */
  source: "model" | "heuristic" | "stub";
}

// ---------------------------------------------------------------------------
// Tenant-scoped data export contract
// ---------------------------------------------------------------------------

/**
 * What the AI service is allowed to receive for a single tenant.
 *
 * Minimization rules:
 *   - No names, emails, phone numbers, or contact details.
 *   - Dates are truncated to day precision (not timestamp).
 *   - Customer identifiers are pseudonymous analytics IDs (not the platform's
 *     `customerProfileId`). The mapping is one-way and per-export.
 *   - Monetary amounts are rounded to the merchant's configured currency unit.
 */
export interface TenantAnalyticsExport {
  merchantId: string;
  /** ISO-8601 window start. */
  windowStart: string;
  /** ISO-8601 window end. */
  windowEnd: string;
  exportedAt: string;
  /**
   * SHA-256 of the merchant's canonical ID, truncated to 16 hex chars.
   * Used so the AI service cannot correlate exports across tenants.
   */
  pseudonymousTenantId: string;
  /** Aggregated customer-level metrics — no PII. */
  customerMetrics: Array<{
    /** Per-export pseudonymous customer ID. One-way, not reversible. */
    pseudonymousCustomerId: string;
    /** ISO-8601 date (day precision). */
    joinDate: string;
    lastActivityDate: string | null;
    totalTransactions: number;
    totalLoyaltyEarned: number;
    totalLoyaltyRedeemed: number;
    totalRewardRedemptions: number;
  }>;
  /** Aggregated merchant-level metrics. */
  merchantMetrics: {
    totalCustomers: number;
    activeCustomers: number;
    totalLoyaltyIssued: number;
    totalLoyaltyRedeemed: number;
    totalRewardRedemptions: number;
  };
}

// ---------------------------------------------------------------------------
// Cross-tenant authorization
// ---------------------------------------------------------------------------

/**
 * Record created before any cross-tenant data use (e.g. federated model
 * training). Must be created by a Super Admin and carry a legal basis.
 *
 * Phase 1: no cross-tenant use is permitted. This contract exists so the
 * access-logging layer can assert its absence.
 */
export interface CrossTenantAuthorizationRecord {
  id: string;
  authorizedBy: string; // Super Admin user ID
  merchantIds: string[];
  purpose: string;
  legalBasis: string; // e.g. "GDPR_EXPLICIT", "LEGITIMATE_INTEREST"
  validFrom: string;
  validUntil: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Access logging
// ---------------------------------------------------------------------------

/**
 * Every AI data access must produce one `AnalyticsAccessRecord`. Written by
 * the AI module before reading any export. Stored in the platform's audit log.
 */
export interface AnalyticsAccessRecord {
  id: string;
  merchantId: string;
  requestedBy: string; // service account or user ID
  purpose: InsightKind | "export" | "training";
  dataWindowStart: string;
  dataWindowEnd: string;
  crossTenantAuthorizationId?: string;
  recordedAt: string;
}

// ---------------------------------------------------------------------------
// Provider interface
// ---------------------------------------------------------------------------

/**
 * Contract the AI/analytics module must satisfy to interact with the loyalty
 * platform (checklist §12 — "separately deployable service or module that
 * consumes governed, tenant-scoped data through explicit contracts").
 *
 * Rules:
 *   1. `requestExport` must log an `AnalyticsAccessRecord` before returning data.
 *   2. `generateInsight` must return `source: "stub"` or `source: "heuristic"`
 *      in Phase 1. `source: "model"` requires a real ML deployment.
 *   3. The returned `AnalyticsInsight` must be treated as advisory by callers —
 *      never used to bypass authorization or business-rule validation.
 *   4. `generateInsight` must not call loyalty service methods. It reads
 *      only what `requestExport` provides.
 */
export interface AnalyticsProvider {
  /**
   * Returns a minimized, pseudonymous, tenant-scoped data export and logs
   * the access. Throws if the requesting service is not authorized.
   */
  requestExport(
    merchantId: string,
    windowStart: Date,
    windowEnd: Date,
    requestedBy: string,
    purpose: AnalyticsAccessRecord["purpose"],
  ): Promise<TenantAnalyticsExport>;

  /**
   * Generates an advisory insight for the given merchant and kind.
   * Must not alter any loyalty ledger data.
   */
  generateInsight(
    merchantId: string,
    kind: InsightKind,
    context?: Record<string, unknown>,
  ): Promise<AnalyticsInsight>;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

let _provider: AnalyticsProvider | null = null;

/** Install the real analytics provider (called during bootstrap). */
export function setAnalyticsProvider(provider: AnalyticsProvider): void {
  _provider = provider;
  getLogger().info("analytics provider registered");
}

/** Return the active provider, or the stub if none is configured. */
export function getAnalyticsProvider(): AnalyticsProvider {
  return _provider ?? stubAnalyticsProvider;
}

// ---------------------------------------------------------------------------
// No-op stub (Phase 1)
// ---------------------------------------------------------------------------

/**
 * Stub analytics provider: returns empty exports and heuristic insights.
 * Logs every call so developers can see the access pattern without a real
 * ML deployment.
 */
const stubAnalyticsProvider: AnalyticsProvider = {
  async requestExport(
    merchantId,
    windowStart,
    windowEnd,
    requestedBy,
    purpose,
  ): Promise<TenantAnalyticsExport> {
    getLogger().debug(
      { merchantId, windowStart, windowEnd, requestedBy, purpose },
      "stub analytics provider: requestExport (no-op)",
    );
    return {
      merchantId,
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
      exportedAt: new Date().toISOString(),
      pseudonymousTenantId: "stub-pseudonymous-tenant",
      customerMetrics: [],
      merchantMetrics: {
        totalCustomers: 0,
        activeCustomers: 0,
        totalLoyaltyIssued: 0,
        totalLoyaltyRedeemed: 0,
        totalRewardRedemptions: 0,
      },
    };
  },

  async generateInsight(merchantId, kind): Promise<AnalyticsInsight> {
    getLogger().debug(
      { merchantId, kind },
      "stub analytics provider: generateInsight (no-op)",
    );
    return {
      id: `stub:${merchantId}:${kind}`,
      merchantId,
      kind,
      confidence: 0,
      label: "No insight available (AI provider not configured)",
      recommendation: {},
      generatedAt: new Date().toISOString(),
      source: "stub",
    };
  },
};
