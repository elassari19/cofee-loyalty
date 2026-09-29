/**
 * In-memory demo workspace (checklist §3 only).
 *
 * The pages built in §3 need something real to render and mutate so the shared
 * patterns (tables, forms, confirmations, results) can be exercised end to end
 * before the TypeORM entities of §4 exist. Everything here is process-local:
 * mutations survive a request but never touch a database, and the UI labels
 * the workspace as demo data.
 *
 * Replaced by the §4/§7 data layer; the exported function shapes are the seam
 * the pages read through, so swapping the body for repository calls should not
 * require touching page markup.
 */

export const CURRENT_CUSTOMER_ID = "cus_maya";

export type MerchantStatus = "active" | "trial" | "suspended";
export type Tier = "Bronze" | "Silver" | "Gold";
export type TransactionType = "earn" | "redeem" | "adjustment";
export type CampaignStatus = "draft" | "scheduled" | "live" | "ended";

export interface Merchant {
  id: string;
  name: string;
  slug: string;
  plan: "Starter" | "Growth" | "Scale";
  status: MerchantStatus;
  customers: number;
  joinedOn: string;
}

export interface PlatformUser {
  id: string;
  name: string;
  email: string;
  role: "Platform administrator" | "Merchant owner";
  merchants: number;
  status: "active" | "invited";
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  points: number;
  tier: Tier;
  joinedOn: string;
  status: "active" | "dormant";
  lastActivityOn: string;
}

export interface Transaction {
  id: string;
  at: string;
  customerId: string;
  customerName: string;
  type: TransactionType;
  points: number;
  /** Purchase amount for `earn` entries, in program currency. */
  amount: number | null;
  staff: string;
  note: string;
}

export interface Reward {
  id: string;
  name: string;
  description: string;
  cost: number;
  active: boolean;
  redeemed: number;
}

export interface Campaign {
  id: string;
  name: string;
  status: CampaignStatus;
  audience: string;
  startsOn: string;
  endsOn: string;
  terms: string;
}

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: "Owner" | "Manager" | "Cashier";
  status: "active" | "invited" | "disabled";
  lastActiveOn: string;
}

export interface LoyaltySettings {
  programName: string;
  description: string;
  /** Points awarded per unit of purchase currency. */
  earnRate: number;
  welcomeBonus: number;
  pointsExpiryMonths: number;
  minPurchase: number;
  currency: string;
}

export interface BusinessSettings {
  storeName: string;
  supportEmail: string;
  timezone: string;
  receiptFooter: string;
  loyaltyEnabled: boolean;
}

export interface OwnProfile {
  name: string;
  email: string;
  phone: string;
}

interface DemoState {
  merchants: Merchant[];
  platformUsers: PlatformUser[];
  customers: Customer[];
  transactions: Transaction[];
  rewards: Reward[];
  campaigns: Campaign[];
  staff: StaffMember[];
  loyalty: LoyaltySettings;
  business: BusinessSettings;
  ownProfile: OwnProfile;
  monthly: { month: string; merchants: number; pointsIssued: number }[];
}

const state: DemoState = {
  merchants: [
    {
      id: "mrc_1",
      name: "Acme Coffee Co.",
      slug: "acme-coffee",
      plan: "Growth",
      status: "active",
      customers: 1284,
      joinedOn: "2025-11-04",
    },
    {
      id: "mrc_2",
      name: "Nordic Bakehouse",
      slug: "nordic-bakehouse",
      plan: "Starter",
      status: "active",
      customers: 342,
      joinedOn: "2026-02-18",
    },
    {
      id: "mrc_3",
      name: "Bluebird Juice Bar",
      slug: "bluebird-juice",
      plan: "Growth",
      status: "trial",
      customers: 89,
      joinedOn: "2026-08-30",
    },
    {
      id: "mrc_4",
      name: "Harbor Roasters",
      slug: "harbor-roasters",
      plan: "Scale",
      status: "active",
      customers: 5610,
      joinedOn: "2025-06-12",
    },
    {
      id: "mrc_5",
      name: "Sunrise Diner",
      slug: "sunrise-diner",
      plan: "Starter",
      status: "suspended",
      customers: 176,
      joinedOn: "2026-01-09",
    },
  ],
  platformUsers: [
    {
      id: "usr_1",
      name: "Dana Okafor",
      email: "dana@loyalty.app",
      role: "Platform administrator",
      merchants: 5,
      status: "active",
    },
    {
      id: "usr_2",
      name: "Priya Raman",
      email: "priya@acmecoffee.example",
      role: "Merchant owner",
      merchants: 1,
      status: "active",
    },
    {
      id: "usr_3",
      name: "Tom Alvarez",
      email: "tom@harborroasters.example",
      role: "Merchant owner",
      merchants: 1,
      status: "active",
    },
    {
      id: "usr_4",
      name: "Elena Petrova",
      email: "elena@nordicbake.example",
      role: "Merchant owner",
      merchants: 1,
      status: "invited",
    },
  ],
  customers: [
    {
      id: "cus_maya",
      name: "Maya Chen",
      email: "maya.chen@example.com",
      phone: "+1 555 0142",
      points: 1240,
      tier: "Gold",
      joinedOn: "2025-12-02",
      status: "active",
      lastActivityOn: "2026-09-24",
    },
    {
      id: "cus_2",
      name: "Jonas Weber",
      email: "jonas.weber@example.com",
      phone: "+1 555 0198",
      points: 460,
      tier: "Silver",
      joinedOn: "2026-03-15",
      status: "active",
      lastActivityOn: "2026-09-27",
    },
    {
      id: "cus_3",
      name: "Aisha Diallo",
      email: "aisha.diallo@example.com",
      phone: "+1 555 0117",
      points: 85,
      tier: "Bronze",
      joinedOn: "2026-09-01",
      status: "active",
      lastActivityOn: "2026-09-21",
    },
    {
      id: "cus_4",
      name: "Liam O'Connor",
      email: "liam.oconnor@example.com",
      phone: "+1 555 0163",
      points: 2180,
      tier: "Gold",
      joinedOn: "2025-07-19",
      status: "active",
      lastActivityOn: "2026-09-28",
    },
    {
      id: "cus_5",
      name: "Sofia Rossi",
      email: "sofia.rossi@example.com",
      phone: "+1 555 0175",
      points: 320,
      tier: "Silver",
      joinedOn: "2026-05-27",
      status: "active",
      lastActivityOn: "2026-09-12",
    },
    {
      id: "cus_6",
      name: "Noah Kim",
      email: "noah.kim@example.com",
      phone: "+1 555 0189",
      points: 40,
      tier: "Bronze",
      joinedOn: "2026-06-11",
      status: "dormant",
      lastActivityOn: "2026-07-04",
    },
    {
      id: "cus_7",
      name: "Grace Osei",
      email: "grace.osei@example.com",
      phone: "+1 555 0136",
      points: 760,
      tier: "Silver",
      joinedOn: "2026-01-23",
      status: "active",
      lastActivityOn: "2026-09-26",
    },
    {
      id: "cus_8",
      name: "Ethan Park",
      email: "ethan.park@example.com",
      phone: "+1 555 0154",
      points: 150,
      tier: "Bronze",
      joinedOn: "2026-04-08",
      status: "active",
      lastActivityOn: "2026-08-30",
    },
  ],
  transactions: [
    {
      id: "txn_1",
      at: "2026-09-28T09:14:00",
      customerId: "cus_maya",
      customerName: "Maya Chen",
      type: "earn",
      points: 45,
      amount: 9,
      staff: "Sam Rivera",
      note: "Counter purchase",
    },
    {
      id: "txn_2",
      at: "2026-09-28T08:52:00",
      customerId: "cus_4",
      customerName: "Liam O'Connor",
      type: "redeem",
      points: -500,
      amount: null,
      staff: "Sam Rivera",
      note: "Free latte",
    },
    {
      id: "txn_3",
      at: "2026-09-27T17:31:00",
      customerId: "cus_7",
      customerName: "Grace Osei",
      type: "earn",
      points: 60,
      amount: 12,
      staff: "Ana Lopez",
      note: "Counter purchase",
    },
    {
      id: "txn_4",
      at: "2026-09-27T11:05:00",
      customerId: "cus_2",
      customerName: "Jonas Weber",
      type: "earn",
      points: 35,
      amount: 7,
      staff: "Sam Rivera",
      note: "Counter purchase",
    },
    {
      id: "txn_5",
      at: "2026-09-26T15:44:00",
      customerId: "cus_5",
      customerName: "Sofia Rossi",
      type: "adjustment",
      points: 100,
      amount: null,
      staff: "Priya Raman",
      note: "Service recovery",
    },
    {
      id: "txn_6",
      at: "2026-09-26T10:22:00",
      customerId: "cus_maya",
      customerName: "Maya Chen",
      type: "redeem",
      points: -300,
      amount: null,
      staff: "Ana Lopez",
      note: "Pastry on us",
    },
    {
      id: "txn_7",
      at: "2026-09-25T13:09:00",
      customerId: "cus_3",
      customerName: "Aisha Diallo",
      type: "earn",
      points: 25,
      amount: 5,
      staff: "Sam Rivera",
      note: "Counter purchase",
    },
    {
      id: "txn_8",
      at: "2026-09-25T09:47:00",
      customerId: "cus_4",
      customerName: "Liam O'Connor",
      type: "earn",
      points: 80,
      amount: 16,
      staff: "Ana Lopez",
      note: "Counter purchase",
    },
    {
      id: "txn_9",
      at: "2026-09-24T16:18:00",
      customerId: "cus_7",
      customerName: "Grace Osei",
      type: "redeem",
      points: -250,
      amount: null,
      staff: "Sam Rivera",
      note: "Upgrade to large",
    },
    {
      id: "txn_10",
      at: "2026-09-24T08:36:00",
      customerId: "cus_maya",
      customerName: "Maya Chen",
      type: "earn",
      points: 55,
      amount: 11,
      staff: "Ana Lopez",
      note: "Counter purchase",
    },
  ],
  rewards: [
    {
      id: "rwd_1",
      name: "Free latte",
      description: "Any size latte, one per visit.",
      cost: 500,
      active: true,
      redeemed: 38,
    },
    {
      id: "rwd_2",
      name: "Pastry on us",
      description: "Choose from the morning pastry case.",
      cost: 300,
      active: true,
      redeemed: 52,
    },
    {
      id: "rwd_3",
      name: "Free bag of beans",
      description: "250g bag of house roast.",
      cost: 1200,
      active: true,
      redeemed: 9,
    },
    {
      id: "rwd_4",
      name: "Birthday cake pop",
      description: "Birthday-month treat.",
      cost: 250,
      active: false,
      redeemed: 14,
    },
    {
      id: "rwd_5",
      name: "Bring-a-friend BOGO",
      description: "Buy one drink, get one free.",
      cost: 750,
      active: true,
      redeemed: 6,
    },
  ],
  campaigns: [
    {
      id: "cmp_1",
      name: "Double points Fridays",
      status: "live",
      audience: "All customers",
      startsOn: "2026-09-04",
      endsOn: "2026-10-30",
      terms: "2× points on all counter purchases on Fridays.",
    },
    {
      id: "cmp_2",
      name: "Win-back: 60 days quiet",
      status: "scheduled",
      audience: "Dormant 60+ days",
      startsOn: "2026-10-01",
      endsOn: "2026-10-15",
      terms: "100 bonus points on a returning visit.",
    },
    {
      id: "cmp_3",
      name: "Gold tier tasting night",
      status: "draft",
      audience: "Gold tier",
      startsOn: "2026-11-06",
      endsOn: "2026-11-06",
      terms: "Invite-only tasting; 200 bonus points on RSVP.",
    },
    {
      id: "cmp_4",
      name: "Spring launch week",
      status: "ended",
      audience: "All customers",
      startsOn: "2026-03-02",
      endsOn: "2026-03-08",
      terms: "Triple points on cold brew.",
    },
  ],
  staff: [
    {
      id: "stf_1",
      name: "Priya Raman",
      email: "priya@acmecoffee.example",
      role: "Owner",
      status: "active",
      lastActiveOn: "2026-09-28",
    },
    {
      id: "stf_2",
      name: "Marco Bianchi",
      email: "marco@acmecoffee.example",
      role: "Manager",
      status: "active",
      lastActiveOn: "2026-09-27",
    },
    {
      id: "stf_3",
      name: "Sam Rivera",
      email: "sam.rivera@acmecoffee.example",
      role: "Cashier",
      status: "active",
      lastActiveOn: "2026-09-28",
    },
    {
      id: "stf_4",
      name: "Ana Lopez",
      email: "ana.lopez@acmecoffee.example",
      role: "Cashier",
      status: "active",
      lastActiveOn: "2026-09-28",
    },
    {
      id: "stf_5",
      name: "Jordan Lee",
      email: "jordan.lee@acmecoffee.example",
      role: "Cashier",
      status: "invited",
      lastActiveOn: "—",
    },
  ],
  loyalty: {
    programName: "Acme Perks",
    description:
      "Earn a point for every currency unit spent. Redeem for free drinks and treats.",
    earnRate: 5,
    welcomeBonus: 100,
    pointsExpiryMonths: 12,
    minPurchase: 1,
    currency: "USD",
  },
  business: {
    storeName: "Acme Coffee Co.",
    supportEmail: "hello@acmecoffee.example",
    timezone: "America/Los_Angeles",
    receiptFooter: "Thanks for stopping by — see you tomorrow!",
    loyaltyEnabled: true,
  },
  ownProfile: {
    name: "Maya Chen",
    email: "maya.chen@example.com",
    phone: "+1 555 0142",
  },
  monthly: [
    { month: "Apr", merchants: 2, pointsIssued: 18400 },
    { month: "May", merchants: 1, pointsIssued: 21100 },
    { month: "Jun", merchants: 3, pointsIssued: 24800 },
    { month: "Jul", merchants: 2, pointsIssued: 27600 },
    { month: "Aug", merchants: 4, pointsIssued: 31200 },
    { month: "Sep", merchants: 2, pointsIssued: 35400 },
  ],
};

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export function listMerchants(): readonly Merchant[] {
  return state.merchants;
}

export function listPlatformUsers(): readonly PlatformUser[] {
  return state.platformUsers;
}

export function listCustomers(): readonly Customer[] {
  return state.customers;
}

export function getCustomer(id: string): Customer | null {
  return state.customers.find((customer) => customer.id === id) ?? null;
}

/** Case-insensitive search over name/email — drives the `?q=` filters. */
export function searchCustomers(
  query: string | undefined,
): readonly Customer[] {
  const q = query?.trim().toLowerCase();
  if (!q) return state.customers;
  return state.customers.filter(
    (customer) =>
      customer.name.toLowerCase().includes(q) ||
      customer.email.toLowerCase().includes(q),
  );
}

export function listTransactions(filter?: {
  type?: TransactionType;
  customerId?: string;
}): readonly Transaction[] {
  return state.transactions.filter((transaction) => {
    if (filter?.type && transaction.type !== filter.type) return false;
    if (filter?.customerId && transaction.customerId !== filter.customerId) {
      return false;
    }
    return true;
  });
}

export function listRewards(): readonly Reward[] {
  return state.rewards;
}

export function getReward(id: string): Reward | null {
  return state.rewards.find((reward) => reward.id === id) ?? null;
}

export function listCampaigns(): readonly Campaign[] {
  return state.campaigns;
}

export function listStaff(): readonly StaffMember[] {
  return state.staff;
}

export function getLoyalty(): LoyaltySettings {
  return { ...state.loyalty };
}

export function getBusiness(): BusinessSettings {
  return { ...state.business };
}

export function getOwnProfile(): OwnProfile {
  return { ...state.ownProfile };
}

export function getMonthly(): readonly {
  month: string;
  merchants: number;
  pointsIssued: number;
}[] {
  return state.monthly;
}

/** The signed-in preview customer (`cus_maya`), for the customer audience. */
export function getCurrentCustomer(): Customer {
  const customer = state.customers.find((c) => c.id === CURRENT_CUSTOMER_ID);
  if (!customer) throw new Error("Demo customer is missing from the store.");
  return customer;
}

// ---------------------------------------------------------------------------
// Metrics (single place so dashboard numbers stay reproducible — §11 will
// replace these with ledger-backed formulas)
// ---------------------------------------------------------------------------

export function merchantMetrics() {
  const activeCustomers = state.customers.filter(
    (c) => c.status === "active",
  ).length;
  const pointsIssued = state.transactions
    .filter((t) => t.points > 0)
    .reduce((sum, t) => sum + t.points, 0);
  const pointsRedeemed = state.transactions
    .filter((t) => t.points < 0)
    .reduce((sum, t) => sum + Math.abs(t.points), 0);
  const redemptions = state.transactions.filter(
    (t) => t.type === "redeem",
  ).length;
  const earns = state.transactions.filter((t) => t.type === "earn").length;
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

export function platformMetrics() {
  const active = state.merchants.filter((m) => m.status === "active").length;
  const customers = state.merchants.reduce((sum, m) => sum + m.customers, 0);
  const pointsIssued = state.monthly.reduce(
    (sum, m) => sum + m.pointsIssued,
    0,
  );
  return { merchants: state.merchants.length, active, customers, pointsIssued };
}

// ---------------------------------------------------------------------------
// Writes (session-local — replaced by §4 services)
// ---------------------------------------------------------------------------

export function updateLoyalty(patch: Partial<LoyaltySettings>): void {
  state.loyalty = { ...state.loyalty, ...patch };
}

export function updateBusiness(patch: BusinessSettings): void {
  state.business = { ...state.business, ...patch };
}

export function updateOwnProfile(patch: OwnProfile): void {
  state.ownProfile = { ...state.ownProfile, ...patch };
}

export function setRewardActive(id: string, active: boolean): Reward {
  const reward = state.rewards.find((r) => r.id === id);
  if (!reward)
    throw new Error("That reward no longer exists. Nothing changed.");
  reward.active = active;
  return { ...reward };
}

export function addCampaign(input: {
  name: string;
  audience: string;
  startsOn: string;
  endsOn: string;
  terms: string;
}): Campaign {
  const campaign: Campaign = {
    id: `cmp_${state.campaigns.length + 1}`,
    name: input.name,
    status: "draft",
    audience: input.audience,
    startsOn: input.startsOn,
    endsOn: input.endsOn,
    terms: input.terms,
  };
  state.campaigns = [campaign, ...state.campaigns];
  return campaign;
}

export function recordPurchase(
  customerId: string,
  amount: number,
): { customerName: string; pointsEarned: number; balance: number } {
  const customer = getCustomer(customerId);
  if (!customer)
    throw new Error("That customer no longer exists. Nothing was recorded.");
  if (amount < state.loyalty.minPurchase) {
    throw new Error(
      `Purchases must be at least ${state.loyalty.minPurchase} to earn points. Nothing was recorded.`,
    );
  }
  const pointsEarned = Math.round(amount * state.loyalty.earnRate);
  customer.points += pointsEarned;
  customer.lastActivityOn = new Date().toISOString().slice(0, 10);
  state.transactions = [
    {
      id: `txn_${state.transactions.length + 1}`,
      at: new Date().toISOString(),
      customerId: customer.id,
      customerName: customer.name,
      type: "earn",
      points: pointsEarned,
      amount,
      staff: "Preview cashier",
      note: "Counter purchase",
    },
    ...state.transactions,
  ];
  return {
    customerName: customer.name,
    pointsEarned,
    balance: customer.points,
  };
}

export function redeemReward(
  rewardId: string,
  customerId: string,
): { customerName: string; rewardName: string; balance: number } {
  const reward = getReward(rewardId);
  if (!reward)
    throw new Error("That reward no longer exists. Nothing was redeemed.");
  if (!reward.active) {
    throw new Error(`“${reward.name}” is deactivated. Nothing was redeemed.`);
  }
  const customer = getCustomer(customerId);
  if (!customer)
    throw new Error("That customer no longer exists. Nothing was redeemed.");
  if (customer.points < reward.cost) {
    throw new Error(
      `${customer.name} has ${customer.points} points — ${reward.cost} needed. Nothing was redeemed.`,
    );
  }
  customer.points -= reward.cost;
  customer.lastActivityOn = new Date().toISOString().slice(0, 10);
  reward.redeemed += 1;
  state.transactions = [
    {
      id: `txn_${state.transactions.length + 1}`,
      at: new Date().toISOString(),
      customerId: customer.id,
      customerName: customer.name,
      type: "redeem",
      points: -reward.cost,
      amount: null,
      staff: "Preview cashier",
      note: reward.name,
    },
    ...state.transactions,
  ];
  return {
    customerName: customer.name,
    rewardName: reward.name,
    balance: customer.points,
  };
}
