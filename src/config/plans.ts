
export type PlanId = "basic" | "advance" | "pro" | "pro-plus";

export type BillingCycle = "monthly" | "yearly";

export type EntitlementKey =
  | "maxUsers"
  | "maxCompanies"
  | "maxAttachmentsGB"
  | "maxStorageGB"
  | "hasMultiDeviceSync"
  | "maxDevices"
  | "hasPrioritySupport"
  | "hasAuditLogs"
  | "hasRoleBasedAccess"
  | "dailyVoucherLimit"
  | "monthlyVoucherLimit"
  | "allowCompanyAdminRecycleBin"
  | "canAddAvatar"
  | "canAddFileImagePdf"
  | "maxVoucherFileCount"
  /** Plan-wise: enable voucher edit history. */
  | "voucherHistoryEnabled"
  /** Plan-wise: max history entries per voucher (1–100). 0 = use default 10. */
  | "voucherHistoryLimit";

export type Entitlements = Record<EntitlementKey, number | boolean>;

export interface Plan {
  id: PlanId;
  name: string;
  tagline: string;
  currency: "NPR" | "USD";
  price: {
    monthly: number; // price per month in currency units (e.g., NPR)
    yearly: number;  // discounted annual price (12m - discount)
  };
  commissionRate?: number; // Commission percentage for distributors
  isFree?: boolean; // Mark plan as free regardless of price
  discountPercentage?: number;
  limitedTimeOfferDate?: any;
  highlight?: boolean; // For UI emphasis (e.g., popular)
  entitlements: Entitlements;
  features: string[]; // Human friendly bullets for UI
}

export const DEFAULT_PLANS: Record<PlanId, Plan> = {
  basic: {
    id: "basic",
    name: "Basic",
    tagline: "Solo / starter use",
    currency: "NPR",
    price: { monthly: 0, yearly: 0 }, // Free tier
    commissionRate: 0,
    isFree: true,
    highlight: false,
    entitlements: {
      maxUsers: 1,
      maxCompanies: 1,
      maxAttachmentsGB: 1,
      maxStorageGB: 1,
      dailyVoucherLimit: 25,
      monthlyVoucherLimit: 500,
      hasMultiDeviceSync: false,
      maxDevices: 1,
      hasPrioritySupport: false,
      hasAuditLogs: false,
      hasRoleBasedAccess: false,
      allowCompanyAdminRecycleBin: false,
      canAddAvatar: false,
      canAddFileImagePdf: false,
      maxVoucherFileCount: 0,
      voucherHistoryEnabled: false,
      voucherHistoryLimit: 0,
    },
    features: [
      "Single user",
      "1 company",
      "1 GB storage & attachments",
      "Single device login",
      "Local backup export",
    ],
  },
  advance: {
    id: "advance",
    name: "Advance",
    tagline: "Small teams & growing firms",
    currency: "NPR",
    price: { monthly: 999, yearly: 9990 }, // ~2 months off
    commissionRate: 5,
    isFree: false,
    highlight: true,
    entitlements: {
      maxUsers: 5,
      maxCompanies: 3,
      maxAttachmentsGB: 10,
      maxStorageGB: 10,
      dailyVoucherLimit: 100,
      monthlyVoucherLimit: 2500,
      hasMultiDeviceSync: true,
      maxDevices: 3,
      hasPrioritySupport: false,
      hasAuditLogs: true,
      hasRoleBasedAccess: true,
      allowCompanyAdminRecycleBin: true,
      canAddAvatar: true,
      canAddFileImagePdf: true,
      maxVoucherFileCount: 3,
      voucherHistoryEnabled: true,
      voucherHistoryLimit: 10,
    },
    features: [
      "Up to 5 users",
      "3 companies",
      "10 GB storage & attachments",
      "Multi-device sync (up to 3 devices)",
      "Role based access",
      "Audit logs",
      "Email support (24–48h)",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    tagline: "Agencies & enterprises",
    currency: "NPR",
    price: { monthly: 2499, yearly: 24990 }, // ~2 months off
    commissionRate: 5,
    isFree: false,
    highlight: false,
    entitlements: {
      maxUsers: 50,
      maxCompanies: 25,
      maxAttachmentsGB: 200,
      maxStorageGB: 200,
      dailyVoucherLimit: 0, // unlimited
      monthlyVoucherLimit: 0, // unlimited
      hasMultiDeviceSync: true,
      maxDevices: 10,
      hasPrioritySupport: true,
      hasAuditLogs: true,
      hasRoleBasedAccess: true,
      allowCompanyAdminRecycleBin: true,
      canAddAvatar: true,
      canAddFileImagePdf: true,
      maxVoucherFileCount: 5,
      voucherHistoryEnabled: true,
      voucherHistoryLimit: 20,
    },
    features: [
      "Up to 50 users",
      "25 companies",
      "200 GB storage & attachments",
      "Multi-device sync (up to 10 devices)",
      "Priority support (SLA)",
      "Advanced audit & backups",
    ],
  },
  "pro-plus": {
    id: "pro-plus",
    name: "Pro Plus",
    tagline: "For large-scale operations",
    currency: "NPR",
    price: { monthly: 4999, yearly: 49990 },
    commissionRate: 5,
    isFree: false,
    highlight: false,
    entitlements: {
      maxUsers: 100,
      maxCompanies: 100,
      maxAttachmentsGB: 500,
      maxStorageGB: 500,
      dailyVoucherLimit: 0, // unlimited
      monthlyVoucherLimit: 0, // unlimited
      hasMultiDeviceSync: true,
      maxDevices: 25,
      hasPrioritySupport: true,
      hasAuditLogs: true,
      hasRoleBasedAccess: true,
      allowCompanyAdminRecycleBin: true,
      canAddAvatar: true,
      canAddFileImagePdf: true,
      maxVoucherFileCount: 5,
      voucherHistoryEnabled: true,
      voucherHistoryLimit: 50,
    },
    features: [
      "Up to 100 users",
      "100 companies",
      "500 GB storage & attachments",
      "Multi-device sync (up to 25 devices)",
      "Dedicated support",
      "Advanced audit & backups",
    ],
  },
};

// ---------- Helpers ----------
export function getPlan(planId?: PlanId | null): Plan {
  if (!planId) return DEFAULT_PLANS.basic;
  return DEFAULT_PLANS[planId] ?? DEFAULT_PLANS.basic;
}

export function isFeatureEnabled(
  planId: PlanId,
  key: Exclude<EntitlementKey, "maxUsers" | "maxCompanies" | "maxAttachmentsGB" | "maxStorageGB" | "dailyVoucherLimit" | "monthlyVoucherLimit" | "maxDevices" | "voucherHistoryLimit">
): boolean {
  const p = getPlan(planId);
  const v = p.entitlements[key];
  return typeof v === "boolean" ? v : false;
}

export function limitFor(
  planId: PlanId,
  key: Extract<EntitlementKey, "maxUsers" | "maxCompanies" | "maxAttachmentsGB" | "maxStorageGB" | "dailyVoucherLimit" | "monthlyVoucherLimit" | "maxDevices" | "voucherHistoryLimit">
): number {
  const p = getPlan(planId);
  const v = p.entitlements[key];
  return typeof v === "number" ? v : 0;
}

export function formatPrice(plan: Plan, cycle: BillingCycle = "monthly", forceShowPrice = false): string {
  if (plan.isFree && !forceShowPrice) return "Free";
  const amount = plan.price[cycle];
  const suffix = plan.currency === "NPR" ? "रु" : plan.currency;
  if (amount === 0 && !forceShowPrice) return "Free";
  // NPR formatting (simple):
  return `${suffix} ${amount.toLocaleString("en-IN")}/${cycle === "monthly" ? "mo" : "yr"}`;
}
