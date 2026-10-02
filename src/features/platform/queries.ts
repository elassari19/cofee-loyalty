import { getDb } from "@/db/connection";
import { MerchantEntity } from "@/db/entities/merchant.entity";
import { LoyaltyMembershipEntity } from "@/db/entities/loyalty-membership.entity";
import { LoyaltyTransactionEntity } from "@/db/entities/loyalty-transaction.entity";

export async function getPlatformMetrics() {
  const db = await getDb();

  const merchants = await db.getRepository(MerchantEntity).count();

  const active = await db.getRepository(MerchantEntity).count({
    where: { status: "active" },
  });

  const customers = await db.getRepository(LoyaltyMembershipEntity).count();

  const rawPoints = await db
    .getRepository(LoyaltyTransactionEntity)
    .createQueryBuilder("tx")
    .where("tx.type LIKE :type", { type: "%_EARNED" })
    .select("SUM(tx.delta)", "sum")
    .getRawOne();

  const pointsIssued = parseInt(rawPoints?.sum ?? "0", 10);

  return { merchants, active, customers, pointsIssued };
}

export async function getRecentMerchants() {
  const db = await getDb();

  const raw = await db
    .getRepository(MerchantEntity)
    .createQueryBuilder("m")
    .select("m.id", "id")
    .addSelect("m.name", "name")
    .addSelect("m.slug", "slug")
    .addSelect("m.status", "status")
    .addSelect("TO_CHAR(m.created_at, 'YYYY-MM-DD')", "joinedOn")
    // just dummy for plan since it might not be in merchant schema
    .addSelect("'Starter'", "plan")
    .orderBy("m.created_at", "DESC")
    .limit(4)
    .getRawMany();

  return raw.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    plan: "Starter", // Hardcoded fallback if missing
    status: r.status,
    customers: 0, // Would need a join to count customers
    joinedOn: r.joinedOn,
  }));
}
