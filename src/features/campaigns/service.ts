import { getDb } from "@/db/connection";
import { CampaignEntity, type Campaign } from "@/db/entities/campaign.entity";
import { runInTransaction } from "@/db/transactions";
import { enqueueDomainEvent } from "@/lib/domain-events";
import { ConflictError, ForbiddenError, NotFoundError } from "@/lib/errors";

export interface ListCampaignsParams {
  merchantId: string;
}

export async function listCampaigns(params: ListCampaignsParams) {
  const db = await getDb();
  return db.manager.find(CampaignEntity, {
    where: { merchantId: params.merchantId },
    order: { createdAt: "DESC" },
  });
}

export async function getCampaign(merchantId: string, campaignId: string) {
  const db = await getDb();
  const campaign = await db.manager.findOne(CampaignEntity, {
    where: { id: campaignId, merchantId },
  });
  if (!campaign) throw new NotFoundError("Campaign not found");
  return campaign;
}

export async function createCampaign(merchantId: string, data: Partial<Campaign>) {
  return runInTransaction(async (em) => {
    const result = await em.insert(CampaignEntity, {
      ...data,
      configuration: data.configuration as any,
      merchantId,
    });
    return result.identifiers[0]?.id;
  });
}

export async function updateCampaign(merchantId: string, campaignId: string, data: Partial<Campaign>) {
  return runInTransaction(async (em) => {
    const campaign = await em.findOne(CampaignEntity, { where: { id: campaignId, merchantId } });
    if (!campaign) throw new NotFoundError("Campaign not found");

    await em.update(CampaignEntity, { id: campaignId }, {
      ...data,
      configuration: data.configuration as any,
    });
  });
}

/**
 * Transitions a campaign from DRAFT or SCHEDULED to ACTIVE and emits a
 * `campaign.started` domain event inside the same transaction (checklist §12).
 *
 * The domain event allows notification adapters, gamification dispatchers, and
 * future analytics pipelines to react to a campaign going live without querying
 * the campaign table directly or coupling to the loyalty ledger.
 */
export async function publishCampaign(merchantId: string, campaignId: string): Promise<Campaign> {
  return runInTransaction(async (em) => {
    const campaign = await em.findOne(CampaignEntity, { where: { id: campaignId, merchantId } });
    if (!campaign) throw new NotFoundError("Campaign not found");
    if (campaign.status === "ACTIVE") return campaign; // idempotent
    if (campaign.status === "ENDED" || campaign.status === "ARCHIVED") {
      throw new ConflictError("A completed campaign cannot be reactivated.");
    }

    await em.update(CampaignEntity, { id: campaignId }, { status: "ACTIVE" });
    campaign.status = "ACTIVE";

    // Enqueued inside the transaction — never announced before the status commits.
    await enqueueDomainEvent(em, {
      merchantId,
      eventType: "campaign.started",
      aggregateType: "campaign",
      aggregateId: campaignId,
      payload: {
        campaignId,
        audienceType: campaign.audience,
        startAt: campaign.startAt.toISOString(),
        endAt: campaign.endAt.toISOString(),
      },
      idempotencyKey: `campaign.started:${campaignId}`,
    });

    return campaign;
  });
}

/**
 * Transitions an ACTIVE campaign to ENDED (or ARCHIVED if explicitly requested)
 * and emits a `campaign.ended` domain event inside the same transaction
 * (checklist §12).
 */
export async function archiveCampaign(
  merchantId: string,
  campaignId: string,
  targetStatus: "ENDED" | "ARCHIVED" = "ARCHIVED",
): Promise<Campaign> {
  return runInTransaction(async (em) => {
    const campaign = await em.findOne(CampaignEntity, { where: { id: campaignId, merchantId } });
    if (!campaign) throw new NotFoundError("Campaign not found");
    if (campaign.status === targetStatus) return campaign; // idempotent

    const terminalStatuses = ["ENDED", "ARCHIVED"] as const;
    if (!["ACTIVE", "SCHEDULED", "DRAFT", ...terminalStatuses].includes(campaign.status)) {
      throw new ConflictError(`Campaign in status ${campaign.status} cannot be archived.`);
    }

    await em.update(CampaignEntity, { id: campaignId }, { status: targetStatus });
    campaign.status = targetStatus;

    // Emit for every terminal transition (ENDED or ARCHIVED), so downstream
    // consumers can clean up wallet passes, stop sending notifications, etc.
    await enqueueDomainEvent(em, {
      merchantId,
      eventType: "campaign.ended",
      aggregateType: "campaign",
      aggregateId: campaignId,
      payload: {
        campaignId,
        finalStatus: targetStatus,
      },
      idempotencyKey: `campaign.ended:${campaignId}`,
    });

    return campaign;
  });
}

export async function deleteCampaign(merchantId: string, campaignId: string) {
  return runInTransaction(async (em) => {
    const campaign = await em.findOne(CampaignEntity, { where: { id: campaignId, merchantId } });
    if (!campaign) throw new NotFoundError("Campaign not found");
    if (campaign.status === "ACTIVE") throw new ForbiddenError("Cannot delete an active campaign");

    await em.delete(CampaignEntity, { id: campaignId });
  });
}

