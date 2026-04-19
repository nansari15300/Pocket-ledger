
export type PlanId = "basic" | "advance" | "pro" | "pro-plus";

/** Monotonic order for upgrade / downgrade UI (basic is 0). */
export const PLAN_TIER_ORDER: PlanId[] = ["basic", "advance", "pro", "pro-plus"];

export function planTierIndex(planId?: string | null): number {
  const i = PLAN_TIER_ORDER.indexOf((planId as PlanId) || "basic");
  return i >= 0 ? i : 0;
}

/** Next paid SKU above current (e.g. advance → pro). Null if already on top paid tier. */
export function getNextPaidUpgrade(fromPlanId?: string | null): PlanId | null {
  const cur = planTierIndex(fromPlanId);
  for (let t = cur + 1; t < PLAN_TIER_ORDER.length; t++) {
    const id = PLAN_TIER_ORDER[t];
    if (id !== "basic") return id;
  }
  return null;
}

export type BillingCycle = "monthly" | "yearly";

export type EntitlementKey =
  /** Max companies that may be linked to Firestore (manual “upload”); 0 = local-only unlimited. Offline/local rows do not count. */
  | "maxOnlineCompanies"
  | "maxUsers"
  | "maxCompanies"
  | "maxAttachmentsGB"
  | "maxStorageGB"
  /** Same numeric caps as above, applied when `storageOption` is device-local (SQLite-first). Falls back to online key if unset. */
  | "maxUsersLocal"
  | "maxCompaniesLocal"
  | "maxAttachmentsGBLocal"
  | "maxStorageGBLocal"
  | "dailyVoucherLimitLocal"
  | "monthlyVoucherLimitLocal"
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
      maxOnlineCompanies: 0,
      maxUsers: 1,
      maxCompanies: 1,
      maxAttachmentsGB: 1,
      maxStorageGB: 1,
      maxUsersLocal: 1,
      maxCompaniesLocal: 1,
      maxAttachmentsGBLocal: 1,
      maxStorageGBLocal: 1,
      dailyVoucherLimit: 25,
      monthlyVoucherLimit: 500,
      dailyVoucherLimitLocal: 25,
      monthlyVoucherLimitLocal: 500,
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
      "Unlimited local (offline) companies",
      "0 online cloud companies (local-only sync)",
      "Single user",
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
      maxOnlineCompanies: 1,
      maxUsers: 5,
      maxCompanies: 3,
      maxAttachmentsGB: 10,
      maxStorageGB: 10,
      maxUsersLocal: 5,
      maxCompaniesLocal: 3,
      maxAttachmentsGBLocal: 10,
      maxStorageGBLocal: 10,
      dailyVoucherLimit: 100,
      monthlyVoucherLimit: 2500,
      dailyVoucherLimitLocal: 100,
      monthlyVoucherLimitLocal: 2500,
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
      "1 online company + unlimited offline",
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
      maxOnlineCompanies: 3,
      maxUsers: 50,
      maxCompanies: 25,
      maxAttachmentsGB: 200,
      maxStorageGB: 200,
      maxUsersLocal: 50,
      maxCompaniesLocal: 25,
      maxAttachmentsGBLocal: 200,
      maxStorageGBLocal: 200,
      dailyVoucherLimit: 0, // unlimited
      monthlyVoucherLimit: 0, // unlimited
      dailyVoucherLimitLocal: 0,
      monthlyVoucherLimitLocal: 0,
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
      "3 online companies + unlimited offline",
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
      maxOnlineCompanies: 10,
      maxUsers: 100,
      maxCompanies: 100,
      maxAttachmentsGB: 500,
      maxStorageGB: 500,
      maxUsersLocal: 100,
      maxCompaniesLocal: 100,
      maxAttachmentsGBLocal: 500,
      maxStorageGBLocal: 500,
      dailyVoucherLimit: 0, // unlimited
      monthlyVoucherLimit: 0, // unlimited
      dailyVoucherLimitLocal: 0,
      monthlyVoucherLimitLocal: 0,
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
      "10 online companies + unlimited offline",
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
  key: Exclude<
    EntitlementKey,
    | "maxUsers"
    | "maxCompanies"
    | "maxAttachmentsGB"
    | "maxStorageGB"
    | "maxUsersLocal"
    | "maxCompaniesLocal"
    | "maxAttachmentsGBLocal"
    | "maxStorageGBLocal"
    | "dailyVoucherLimit"
    | "monthlyVoucherLimit"
    | "dailyVoucherLimitLocal"
    | "monthlyVoucherLimitLocal"
    | "maxDevices"
    | "voucherHistoryLimit"
  >
): boolean {
  const p = getPlan(planId);
  const v = p.entitlements[key];
  return typeof v === "boolean" ? v : false;
}

export function limitFor(
  planId: PlanId,
  key: Extract<
    EntitlementKey,
    | "maxOnlineCompanies"
    | "maxUsers"
    | "maxCompanies"
    | "maxAttachmentsGB"
    | "maxStorageGB"
    | "maxUsersLocal"
    | "maxCompaniesLocal"
    | "maxAttachmentsGBLocal"
    | "maxStorageGBLocal"
    | "dailyVoucherLimit"
    | "monthlyVoucherLimit"
    | "dailyVoucherLimitLocal"
    | "monthlyVoucherLimitLocal"
    | "maxDevices"
    | "voucherHistoryLimit"
  >
): number {
  const p = getPlan(planId);
  const v = p.entitlements[key];
  return typeof v === "number" ? v : 0;
}

/** Keys that share online (`baseKey`) + local (`*Local`) entitlements — admin PlanDetails + `numericEntitlement`. */
export type NumericEntitlementBaseKey =
  | "maxUsers"
  | "maxCompanies"
  | "maxAttachmentsGB"
  | "maxStorageGB"
  | "dailyVoucherLimit"
  | "monthlyVoucherLimit";

const LOCAL_NUMERIC_ENTITLEMENT_KEY: Record<NumericEntitlementBaseKey, EntitlementKey> = {
  maxUsers: "maxUsersLocal",
  maxCompanies: "maxCompaniesLocal",
  maxAttachmentsGB: "maxAttachmentsGBLocal",
  maxStorageGB: "maxStorageGBLocal",
  dailyVoucherLimit: "dailyVoucherLimitLocal",
  monthlyVoucherLimit: "monthlyVoucherLimitLocal",
};

/** App-wide: missing `storageOption` → treat as device-local (matches `isOfflineCompanyStorage`). */
export function companyStorageIsLocal(storageOption?: string | null): boolean {
  return String(storageOption || "local").toLowerCase() === "local";
}

/**
 * Read plan cap for cloud vs SQLite-first company. Local key missing (old Firestore) → use online value.
 */
export function numericEntitlement(
  entitlements: Partial<Entitlements> | undefined,
  baseKey: NumericEntitlementBaseKey,
  useLocalLimit: boolean
): number {
  const e = entitlements ?? ({} as Partial<Entitlements>);
  if (useLocalLimit) {
    const lk = LOCAL_NUMERIC_ENTITLEMENT_KEY[baseKey];
    const lv = e[lk];
    if (typeof lv === "number" && Number.isFinite(lv)) return lv;
  }
  const v = e[baseKey];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

export function formatPrice(plan: Plan, cycle: BillingCycle = "monthly", forceShowPrice = false): string {
  if (plan.isFree && !forceShowPrice) return "Free";
  const amount = plan.price[cycle];
  const suffix = plan.currency === "NPR" ? "रु" : plan.currency;
  if (amount === 0 && !forceShowPrice) return "Free";
  // NPR formatting (simple):
  return `${suffix} ${amount.toLocaleString("en-IN")}/${cycle === "monthly" ? "mo" : "yr"}`;
}
