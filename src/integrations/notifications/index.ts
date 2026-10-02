/**
 * Provider-neutral notification channel adapters (checklist §12 —
 * "Define notification interfaces for channel adapters, provider callbacks,
 * delivery status, templates, opt-out, and per-channel customer consent;
 * no marketing send without required consent").
 *
 * Architecture contract:
 *
 * - Every channel (WhatsApp, SMS, push, email marketing) is behind a
 *   `NotificationChannelAdapter`. The core loyalty engine never imports a
 *   concrete provider.
 * - A `NotificationMessage` carries tenant context, the customer's canonical
 *   platform ID, and a template key — never the raw contact details from the
 *   core customer table. The adapter resolves contact details from its own
 *   integration configuration, scoped to the merchant.
 * - Consent is checked by `canSend()` **before** enqueuing any message. The
 *   caller is responsible for passing accurate consent; the adapter provides
 *   a second-layer opt-out check at send time.
 * - Delivery status is written back asynchronously through `recordDelivery()`,
 *   which appends to the platform's audit trail. Provider webhooks call this;
 *   the message body is never stored in the audit row.
 * - Phase 1 ships a no-op stub adapter. Concrete providers are future work
 *   that only need to implement `NotificationChannelAdapter`.
 *
 * What is NOT here (Phase 1 non-goals):
 *   - Actual WhatsApp Business API or SMS provider credentials
 *   - Marketing automation scheduling
 *   - Message body templating engine
 *   - Bulk-send orchestration
 */

import { getLogger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Channel types
// ---------------------------------------------------------------------------

/** Closed set of supported notification channels. */
export const NOTIFICATION_CHANNELS = ["whatsapp", "sms", "push"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/** Closed set of notification kinds — drives template selection. */
export const NOTIFICATION_KINDS = [
  /** Transactional: points/stamps were awarded. */
  "loyalty.transaction.created",
  /** Transactional: a reward redemption code was issued. */
  "reward.redeemed",
  /** Transactional: a customer joined a merchant's program. */
  "customer.enrolled",
  /** Marketing: a campaign has started (requires marketing consent). */
  "campaign.started",
  /** Marketing: a campaign-specific offer for this customer. */
  "campaign.offer",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/** Whether the kind is marketing (requires explicit marketing consent). */
export function isMarketingNotification(kind: NotificationKind): boolean {
  return kind === "campaign.started" || kind === "campaign.offer";
}

// ---------------------------------------------------------------------------
// Consent model
// ---------------------------------------------------------------------------

/**
 * Per-customer, per-channel consent record (checklist §12 — "Store channel
 * consent, opt-out state, and applicable legal basis/preferences per customer
 * and channel; check them at send time").
 *
 * The platform stores one row per (customerProfileId, merchantId, channel).
 * This interface is the canonical contract; concrete storage is future work
 * (a `channel_consent` table or an integration-record metadata key).
 */
export interface ChannelConsent {
  customerProfileId: string;
  merchantId: string;
  channel: NotificationChannel;
  /** Transactional messages (e.g. receipt, redemption code). */
  transactional: boolean;
  /** Marketing messages (campaigns, offers). */
  marketing: boolean;
  /** ISO-8601 timestamp when consent was last updated. */
  updatedAt: string;
  /** Optional legal basis code (e.g. "GDPR_EXPLICIT", "LEGITIMATE_INTEREST"). */
  legalBasis?: string;
}

// ---------------------------------------------------------------------------
// Message model
// ---------------------------------------------------------------------------

/**
 * A platform notification to be delivered through a channel adapter.
 *
 * Important: `payload` should carry only IDs and computed values — not raw
 * PII such as email addresses or phone numbers. The adapter resolves contact
 * details from its own scoped integration configuration.
 */
export interface NotificationMessage {
  /** Stable platform correlation ID for this notification attempt. */
  id: string;
  merchantId: string;
  customerProfileId: string;
  channel: NotificationChannel;
  kind: NotificationKind;
  /**
   * Template key the adapter uses to select its channel-specific template.
   * Format: `<kind>.<locale>`, e.g. `loyalty.transaction.created.en`.
   */
  templateKey: string;
  /**
   * Merge variables for the template. Values are safe scalars (string, number,
   * boolean). No PII that is not already known to the customer.
   */
  payload: Record<string, string | number | boolean>;
  /** ISO-8601 scheduled delivery time; omit for immediate. */
  scheduledAt?: string;
}

// ---------------------------------------------------------------------------
// Delivery status
// ---------------------------------------------------------------------------

export const DELIVERY_STATUSES = [
  "queued",
  "sent",
  "delivered",
  "failed",
  "opted_out",
] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export interface DeliveryRecord {
  notificationId: string;
  merchantId: string;
  channel: NotificationChannel;
  status: DeliveryStatus;
  /** Provider-assigned message identifier for correlation. */
  providerMessageId?: string;
  /** Human-readable failure reason, redacted of PII. */
  failureReason?: string;
  recordedAt: string;
}

// ---------------------------------------------------------------------------
// Adapter interface
// ---------------------------------------------------------------------------

/**
 * Contract every channel adapter must satisfy (checklist §12 — "channel
 * adapters, queued delivery, provider status callbacks, retry limits, and
 * delivery audit records").
 *
 * Rules:
 *   1. `canSend` must be called before `send`. A caller that bypasses it
 *      violates the consent contract.
 *   2. `send` MUST NOT store the message body in platform audit logs — only
 *      the `notificationId`, `status`, and `providerMessageId`.
 *   3. `recordDelivery` is idempotent: a duplicate webhook call for the same
 *      `notificationId` and `status` is silently accepted.
 *   4. Concrete adapters must not expose customer contact details to other
 *      tenants or other providers.
 */
export interface NotificationChannelAdapter {
  readonly channel: NotificationChannel;

  /**
   * Returns true when the customer's consent allows the given notification
   * kind to be sent on this channel for this merchant.
   *
   * Must be called before `send`. Never throws — a lookup failure must
   * resolve to `false` (deny-by-default).
   */
  canSend(
    customerProfileId: string,
    merchantId: string,
    kind: NotificationKind,
  ): Promise<boolean>;

  /**
   * Enqueues or immediately sends the notification.
   *
   * Throws `ConsentDeniedError` if called without a prior `canSend` returning
   * true. Other errors are delivery failures — callers should catch and retry
   * through the outbox.
   */
  send(message: NotificationMessage): Promise<{ providerMessageId: string }>;

  /**
   * Records a provider delivery-status callback. Called by webhook handlers
   * after receiving a provider event. Must not throw.
   */
  recordDelivery(record: DeliveryRecord): Promise<void>;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const adapters = new Map<NotificationChannel, NotificationChannelAdapter>();

/** Install a concrete channel adapter (called during bootstrap). */
export function registerNotificationAdapter(
  adapter: NotificationChannelAdapter,
): void {
  adapters.set(adapter.channel, adapter);
  getLogger().info(
    { channel: adapter.channel },
    "notification channel adapter registered",
  );
}

/** Return the adapter for a channel, or undefined if not configured. */
export function getNotificationAdapter(
  channel: NotificationChannel,
): NotificationChannelAdapter | undefined {
  return adapters.get(channel);
}

/** List all registered channels. */
export function registeredChannels(): NotificationChannel[] {
  return [...adapters.keys()];
}

// ---------------------------------------------------------------------------
// No-op stub (Phase 1)
// ---------------------------------------------------------------------------

/**
 * Stub adapter installed by default for every channel.
 *
 * All sends are captured in a local log (non-production) and immediately
 * acknowledged so the rest of the platform can exercise notification paths
 * without a real provider.
 *
 * Replacing this with a real adapter is a one-line `registerNotificationAdapter()`
 * call in the application bootstrap — no platform code changes needed.
 */
class StubNotificationAdapter implements NotificationChannelAdapter {
  constructor(readonly channel: NotificationChannel) {}

  async canSend(
    _customerProfileId: string,
    _merchantId: string,
    _kind: NotificationKind,
  ): Promise<boolean> {
    // Stub: deny-by-default (no real consent store in Phase 1).
    return false;
  }

  async send(
    message: NotificationMessage,
  ): Promise<{ providerMessageId: string }> {
    const logger = getLogger();
    if (process.env.NODE_ENV !== "production") {
      logger.debug(
        {
          channel: this.channel,
          notificationId: message.id,
          kind: message.kind,
          merchantId: message.merchantId,
          customerProfileId: message.customerProfileId,
        },
        "stub notification adapter: send (no-op)",
      );
    }
    return { providerMessageId: `stub:${message.id}` };
  }

  async recordDelivery(record: DeliveryRecord): Promise<void> {
    getLogger().debug(
      { notificationId: record.notificationId, status: record.status },
      "stub notification adapter: recordDelivery (no-op)",
    );
  }
}

// Register stubs for all channels at module load so adapters are never missing.
for (const channel of NOTIFICATION_CHANNELS) {
  adapters.set(channel, new StubNotificationAdapter(channel));
}
