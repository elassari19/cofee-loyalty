import { getDb } from "@/db/connection";
import { CampaignEntity, type Campaign } from "@/db/entities/campaign.entity";
import { runInTransaction } from "@/db/transactions";
import { ForbiddenError, NotFoundError } from "@/lib/errors";

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

export async function deleteCampaign(merchantId: string, campaignId: string) {
  return runInTransaction(async (em) => {
    const campaign = await em.findOne(CampaignEntity, { where: { id: campaignId, merchantId } });
    if (!campaign) throw new NotFoundError("Campaign not found");
    if (campaign.status === "ACTIVE") throw new ForbiddenError("Cannot delete an active campaign");

    await em.delete(CampaignEntity, { id: campaignId });
  });
}
