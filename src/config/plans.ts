import { getCurrencySymbolForCode } from "@/lib/worldCurrencies";
import type { RegionalPlanPricesMap } from "@/lib/billingRegionalPricing";

export type PlanId = "basic" | "advance" | "pro" | "pro-plus";

/** Monotonic order for upgrade / downgrade UI (basic is 0). */
export const PLAN_TIER_ORDER: PlanId[] = ["basic", "advance", "pro", "pro-plus"];

/**
 * Firestore / admin / legacy strings → canonical SKU.
 * `proplus`, `Pro Plus`, `pro_plus` waghera ko map karo — warna strict `PLAN_TIER_ORDER.includes` fail ho kar shared user ko "Basic" dikh jata hai.
 * Core tier order + `higherPlanByTier` static build / web dono me yahi; ye helper har jagah ek hi canonical `planId` ensure karta hai.
 * Next API routes (`plan-change-checkout`, `sync-plan`, …) bhi isi ko import karein — strict match se `proplus` manual Firestore = galat `basic`.
 */
export function normalizePlanIdForClient(raw?: string | null): PlanId {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/_/g, "-");
  if (s === "proplus") return "pro-plus";
  if (PLAN_TIER_ORDER.includes(s as PlanId)) return s as PlanId;
  return "basic";
}

export function planTierIndex(planId?: string | null): number {
  const id = normalizePlanIdForClient(planId);
  const i = PLAN_TIER_ORDER.indexOf(id);
  return i >= 0 ? i : 0;
}

/**
 * Voucher quota / entitlements: Firestore `companies` kabhi purana `basic` chipkata hai jab SQLite mirror + UI `pro-plus` ho chuke hon —
 * dono source me se zyada paid tier lo.
 */
export function higherPlanByTier(
  firestorePlanId?: string | null,
  sqliteOrOtherPlanId?: string | null
): PlanId {
  const a = normalizePlanIdForClient(firestorePlanId);
  const b = normalizePlanIdForClient(sqliteOrOtherPlanId);
  const ia = planTierIndex(a);
  const ib = planTierIndex(b);
  return ib > ia ? b : a;
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
  /** Billing chart + admin: cloud vs SQLite-first company — abhi runtime limit same; alag SKU future ke liye. */
  | "maxDevicesLocal"
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
  | "voucherHistoryLimit"
  /** Max joined inter-company partner companies (Join tab). 0 = unlimited. */
  | "maxInterCompanyPartners"
  /** Plan-wise: APK/EXE saved account quick switch on login + logout save. */
  | "savedAccountSwitchEnabled"
  /** Plan-wise: Share for Reconciliation (header + cross-user ledger match). */
  | "shareForReconciliationEnabled"
  /** Backup/restore `.plbp` me attachment bytes embed + restore (Option A). Off = data-only URLs. */
  | "attachmentBackupRestoreEnabled"
  /** Per owner per calendar month — attachment wala backup count; 0 = unlimited. */
  | "maxAttachmentBackupPerMonth"
  /** Per owner per calendar month — attachment wala restore count; 0 = unlimited. */
  | "maxAttachmentRestorePerMonth"
  /** Local company → cloud upload: max attachment payload (MB); 0 = unlimited. */
  | "maxLocalToOnlineAttachmentMB";

export type Entitlements = Record<EntitlementKey, number | boolean>;

export interface Plan {
  id: PlanId;
  name: string;
  tagline: string;
  /** ISO 4217 — admin base catalog currency (`billing_pricing.baseCurrency`). */
  currency: string;
  price: {
    monthly: number; // price per month in currency units (e.g., NPR)
    yearly: number;  // discounted annual price (12m - discount)
  };
  /** Nepal / SAARC / International — admin alag rate; user country se region pick. */
  regionalPrices?: RegionalPlanPricesMap;
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
      maxDevicesLocal: 1,
      hasPrioritySupport: false,
      hasAuditLogs: false,
      hasRoleBasedAccess: false,
      allowCompanyAdminRecycleBin: false,
      canAddAvatar: false,
      canAddFileImagePdf: false,
      maxVoucherFileCount: 0,
      voucherHistoryEnabled: false,
      voucherHistoryLimit: 0,
      maxInterCompanyPartners: 1,
      shareForReconciliationEnabled: false,
      attachmentBackupRestoreEnabled: false,
      maxAttachmentBackupPerMonth: 0,
      maxAttachmentRestorePerMonth: 0,
      maxLocalToOnlineAttachmentMB: 0,
      savedAccountSwitchEnabled: false,
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
      maxDevicesLocal: 3,
      hasPrioritySupport: false,
      hasAuditLogs: true,
      hasRoleBasedAccess: true,
      allowCompanyAdminRecycleBin: true,
      canAddAvatar: true,
      canAddFileImagePdf: true,
      maxVoucherFileCount: 3,
      voucherHistoryEnabled: true,
      voucherHistoryLimit: 10,
      maxInterCompanyPartners: 3,
      shareForReconciliationEnabled: false,
      attachmentBackupRestoreEnabled: true,
      maxAttachmentBackupPerMonth: 2,
      maxAttachmentRestorePerMonth: 2,
      maxLocalToOnlineAttachmentMB: 500,
      savedAccountSwitchEnabled: true,
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
      maxDevicesLocal: 10,
      hasPrioritySupport: true,
      hasAuditLogs: true,
      hasRoleBasedAccess: true,
      allowCompanyAdminRecycleBin: true,
      canAddAvatar: true,
      canAddFileImagePdf: true,
      maxVoucherFileCount: 5,
      voucherHistoryEnabled: true,
      voucherHistoryLimit: 20,
      maxInterCompanyPartners: 10,
      shareForReconciliationEnabled: true,
      attachmentBackupRestoreEnabled: true,
      maxAttachmentBackupPerMonth: 5,
      maxAttachmentRestorePerMonth: 5,
      maxLocalToOnlineAttachmentMB: 2000,
      savedAccountSwitchEnabled: true,
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
      maxDevicesLocal: 25,
      hasPrioritySupport: true,
      hasAuditLogs: true,
      hasRoleBasedAccess: true,
      allowCompanyAdminRecycleBin: true,
      canAddAvatar: true,
      canAddFileImagePdf: true,
      maxVoucherFileCount: 5,
      voucherHistoryEnabled: true,
      voucherHistoryLimit: 50,
      maxInterCompanyPartners: 0,
      shareForReconciliationEnabled: true,
      attachmentBackupRestoreEnabled: true,
      maxAttachmentBackupPerMonth: 10,
      maxAttachmentRestorePerMonth: 10,
      maxLocalToOnlineAttachmentMB: 5000,
      savedAccountSwitchEnabled: true,
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
    | "maxDevicesLocal"
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
    | "maxDevicesLocal"
    | "voucherHistoryLimit"
    | "maxInterCompanyPartners"
    | "maxAttachmentBackupPerMonth"
    | "maxAttachmentRestorePerMonth"
    | "maxLocalToOnlineAttachmentMB"
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
 * Voucher day/month caps: aksar sirf Firestore/UI me `dailyVoucherLimit` bump hota aur `dailyVoucherLimitLocal` default 25 chipka rehta —
 * SQLite-first company par dono finite hon to Math.max taaki unintended Basic cap na lage.
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
    const bv = e[baseKey];
    const isVoucherQuota = baseKey === "dailyVoucherLimit" || baseKey === "monthlyVoucherLimit";
    const localN = typeof lv === "number" && Number.isFinite(lv) ? lv : null;
    const baseN = typeof bv === "number" && Number.isFinite(bv) ? bv : null;
    if (isVoucherQuota) {
      // Plans me `0` = unlimited cap for that bucket
      if (localN != null && localN <= 0) return 0;
      if (baseN != null && baseN <= 0) return 0;
      if (localN != null && baseN != null) return Math.max(localN, baseN);
      if (localN != null) return localN;
      if (baseN != null) return baseN;
      return 0;
    }
    if (localN != null) return localN;
  }
  const v = e[baseKey];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

export function formatPrice(
  plan: Plan,
  cycle: BillingCycle = "monthly",
  forceShowPrice = false,
  /** Company/user display symbol — billing page `useDisplayCurrency` se pass karo. */
  displaySymbolOverride?: string
): string {
  if (plan.isFree && !forceShowPrice) return "Free";
  const amount = plan.price[cycle];
  const suffix =
    displaySymbolOverride?.trim() ||
    getCurrencySymbolForCode(plan.currency) ||
    plan.currency;
  if (amount === 0 && !forceShowPrice) return "Free";
  return `${suffix} ${amount.toLocaleString("en-IN")}/${cycle === "monthly" ? "mo" : "yr"}`;
}
