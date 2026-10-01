import { getDb } from "@/db/connection";
import { LoyaltyMembershipEntity } from "@/db/entities/loyalty-membership.entity";
import { LoyaltyTransactionEntity } from "@/db/entities/loyalty-transaction.entity";
import { RewardRedemptionEntity } from "@/db/entities/reward-redemption.entity";
import { RewardEntity } from "@/db/entities/reward.entity";

export async function getMerchantAnalytics(merchantId: string) {
  const db = await getDb();

  const activeCustomers = await db
    .getRepository(LoyaltyMembershipEntity)
    .count({
      where: { merchantId, status: "active" },
    });

  const transactions = await db
    .getRepository(LoyaltyTransactionEntity)
    .createQueryBuilder("tx")
    .where("tx.merchant_id = :merchantId", { merchantId })
    .select("tx.type", "type")
    .addSelect("SUM(tx.delta)", "sum")
    .addSelect("COUNT(tx.id)", "count")
    .groupBy("tx.type")
    .getRawMany();

  let pointsIssued = 0;
  let pointsRedeemed = 0;
  let earns = 0;
  let redemptions = 0;

  for (const t of transactions) {
    const sum = parseInt(t.sum ?? "0", 10);
    const count = parseInt(t.count ?? "0", 10);
    
    if (t.type.endsWith("_EARNED")) {
      pointsIssued += sum;
      earns += count;
    } else if (t.type.endsWith("_REDEEMED")) {
      pointsRedeemed += Math.abs(sum);
      redemptions += count;
    }
  }

  const redemptionRate =
    earns + redemptions === 0 ? 0 : redemptions / (earns + redemptions);

  return {
    activeCustomers,
    pointsIssued,
    pointsRedeemed,
    redemptions,
    redemptionRate,
  };
}

export async function getMerchantMonthlyPoints(merchantId: string) {
  const db = await getDb();
  
  // A simple grouping by month
  const raw = await db
    .getRepository(LoyaltyTransactionEntity)
    .createQueryBuilder("tx")
    .where("tx.merchant_id = :merchantId", { merchantId })
    .andWhere("tx.type LIKE :type", { type: "%_EARNED" })
    .select("TO_CHAR(tx.created_at, 'Mon')", "month")
    .addSelect("SUM(tx.delta)", "issued")
    .groupBy("TO_CHAR(tx.created_at, 'Mon')")
    // Note: real implementation would order by real date
    .getRawMany();

  return raw.map((r) => ({
    month: r.month,
    pointsIssued: parseInt(r.issued ?? "0", 10),
  }));
}

export async function getRewardPerformance(merchantId: string) {
  const db = await getDb();

  const rewards = await db
    .getRepository(RewardEntity)
    .createQueryBuilder("reward")
    .where("reward.merchant_id = :merchantId", { merchantId })
    .leftJoin(
      "reward_redemption",
      "redemption",
      "redemption.reward_id = reward.id AND redemption.status = 'REDEEMED'"
    )
    .select("reward.id", "id")
    .addSelect("reward.name", "name")
    .addSelect("reward.cost", "cost")
    .addSelect("reward.active", "active")
    .addSelect("COUNT(redemption.id)", "redeemed")
    .groupBy("reward.id")
    .orderBy("COUNT(redemption.id)", "DESC")
    .limit(5)
    .getRawMany();

  return rewards.map(r => ({
    id: r.id,
    name: r.name,
    cost: parseInt(r.cost, 10),
    active: r.active,
    redeemed: parseInt(r.redeemed, 10),
  }));
}
