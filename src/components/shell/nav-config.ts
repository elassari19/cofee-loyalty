import {
  ActivityIcon,
  BadgePercentIcon,
  CoffeeIcon,
  GiftIcon,
  HomeIcon,
  LayoutDashboardIcon,
  LineChartIcon,
  MegaphoneIcon,
  ReceiptIcon,
  SearchIcon,
  SettingsIcon,
  ShieldCheckIcon,
  StoreIcon,
  TagsIcon,
  TicketIcon,
  UserCogIcon,
  UserIcon,
  UsersIcon,
  UsersRoundIcon,
  type LucideIcon,
} from "lucide-react";

import {
  audienceForRole,
  hasCapability,
  type Audience,
  type Capability,
  type Role,
} from "@/auth/roles";

/**
 * Role-aware navigation (checklist §3 bullets 1–3).
 *
 * One declaration per audience drives the sidebar, the mobile sheet, the
 * header breadcrumb and the landing/preview links, so an item can never appear
 * in the UI without the capability that guards its page. Filtering here is a
 * *convenience*: the page and API guards in `src/auth/guard.ts` are what
 * actually enforce access.
 */

export interface NavItem {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  /** Hidden when the role lacks it — the page checks the same capability. */
  capability?: Capability;
  /** Exact-match only (section roots with child routes). */
  end?: boolean;
}

export interface NavSection {
  /** Optional group heading; omit for the unlabelled lead section. */
  title?: string;
  items: NavItem[];
}

const platformNav: NavSection[] = [
  {
    items: [
      {
        key: "admin-overview",
        label: "Overview",
        href: "/admin",
        icon: LayoutDashboardIcon,
        end: true,
      },
    ],
  },
  {
    title: "Manage",
    items: [
      {
        key: "admin-merchants",
        label: "Merchants",
        href: "/admin/merchants",
        icon: StoreIcon,
        capability: "platform.manage",
      },
      {
        key: "admin-users",
        label: "Users",
        href: "/admin/users",
        icon: UsersRoundIcon,
        capability: "platform.manage",
      },
    ],
  },
  {
    title: "Insights",
    items: [
      {
        key: "admin-analytics",
        label: "Analytics",
        href: "/admin/analytics",
        icon: LineChartIcon,
        capability: "platform.manage",
      },
    ],
  },
  {
    title: "System",
    items: [
      {
        key: "admin-settings",
        label: "Settings",
        href: "/admin/settings",
        icon: SettingsIcon,
        capability: "platform.manage",
      },
    ],
  },
];

const merchantNav: NavSection[] = [
  {
    items: [
      {
        key: "merchant-dashboard",
        label: "Dashboard",
        href: "/dashboard",
        icon: LayoutDashboardIcon,
        end: true,
      },
    ],
  },
  {
    title: "Program",
    items: [
      {
        key: "loyalty",
        label: "Loyalty program",
        href: "/loyalty",
        icon: BadgePercentIcon,
        capability: "loyalty.read",
      },
    ],
  },
  {
    title: "Operate",
    items: [
      {
        key: "customers",
        label: "Customers",
        href: "/customers",
        icon: UsersIcon,
        capability: "customers.read",
      },
      {
        key: "transactions",
        label: "Transactions",
        href: "/transactions",
        icon: ReceiptIcon,
        capability: "transactions.read",
      },
      {
        key: "rewards",
        label: "Rewards",
        href: "/rewards",
        icon: GiftIcon,
        capability: "rewards.read",
      },
      {
        key: "campaigns",
        label: "Campaigns",
        href: "/campaigns",
        icon: MegaphoneIcon,
        capability: "campaigns.read",
      },
    ],
  },
  {
    title: "Team",
    items: [
      {
        key: "staff",
        label: "Staff",
        href: "/staff",
        icon: UserCogIcon,
        capability: "staff.read",
      },
    ],
  },
  {
    title: "Insights",
    items: [
      {
        key: "analytics",
        label: "Analytics",
        href: "/analytics",
        icon: LineChartIcon,
        capability: "analytics.read",
      },
    ],
  },
  {
    title: "Business",
    items: [
      {
        key: "settings",
        label: "Settings",
        href: "/settings",
        icon: SettingsIcon,
        capability: "merchant.read",
      },
    ],
  },
];

const staffNav: NavSection[] = [
  {
    items: [
      {
        key: "register",
        label: "Register",
        href: "/register",
        icon: CoffeeIcon,
        end: true,
      },
    ],
  },
  {
    title: "Counter",
    items: [
      {
        key: "register-customers",
        label: "Find customer",
        href: "/register/customers",
        icon: SearchIcon,
        capability: "customers.read",
      },
      {
        key: "register-transactions",
        label: "Transactions",
        href: "/register/transactions",
        icon: ReceiptIcon,
        capability: "transactions.read",
      },
      {
        key: "register-rewards",
        label: "Redeem reward",
        href: "/register/rewards",
        icon: TicketIcon,
        capability: "rewards.read",
      },
    ],
  },
];

const customerNav: NavSection[] = [
  {
    items: [
      { key: "me", label: "Overview", href: "/me", icon: HomeIcon, end: true },
    ],
  },
  {
    title: "Loyalty",
    items: [
      {
        key: "me-rewards",
        label: "Rewards",
        href: "/me/rewards",
        icon: GiftIcon,
        capability: "rewards.read",
      },
      {
        key: "me-activity",
        label: "Activity",
        href: "/me/activity",
        icon: ActivityIcon,
        capability: "transactions.read",
      },
      {
        key: "me-offers",
        label: "Offers",
        href: "/me/offers",
        icon: TagsIcon,
        capability: "campaigns.read",
      },
    ],
  },
  {
    title: "Account",
    items: [
      {
        key: "me-profile",
        label: "Profile",
        href: "/me/profile",
        icon: UserIcon,
        capability: "profile.read",
      },
    ],
  },
];

const NAV_BY_AUDIENCE: Record<Audience, NavSection[]> = {
  platform: platformNav,
  merchant: merchantNav,
  staff: staffNav,
  customer: customerNav,
};

/** Navigation sections the role may actually see (capability-filtered). */
export function navForRole(role: Role): NavSection[] {
  const audience = audienceForRole(role);
  return NAV_BY_AUDIENCE[audience]
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) => !item.capability || hasCapability(role, item.capability),
      ),
    }))
    .filter((section) => section.items.length > 0);
}

export interface ResolvedNavItem {
  section?: string;
  item: NavItem;
}

/** Resolves the nav item (and its section) for the current path, if any. */
export function navItemForPath(
  role: Role,
  pathname: string,
): ResolvedNavItem | null {
  for (const section of navForRole(role)) {
    for (const item of section.items) {
      const matched = item.end
        ? pathname === item.href
        : pathname === item.href || pathname.startsWith(`${item.href}/`);
      if (matched) return { section: section.title, item };
    }
  }
  return null;
}

const BRANDS: Record<
  Audience,
  { name: string; context: string; icon: LucideIcon }
> = {
  platform: {
    name: "Loyalty Platform",
    context: "Administration",
    icon: ShieldCheckIcon,
  },
  merchant: {
    name: "Merchant console",
    context: "Loyalty operations",
    icon: StoreIcon,
  },
  staff: { name: "Register", context: "Counter operations", icon: CoffeeIcon },
  customer: { name: "Loyalty", context: "My rewards", icon: GiftIcon },
};

export function brandForRole(role: Role): {
  name: string;
  context: string;
  icon: LucideIcon;
} {
  return BRANDS[audienceForRole(role)];
}
