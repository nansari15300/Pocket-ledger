
"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef, useMemo } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "./useAuth";
import { onSnapshot, collection, query, where, Timestamp, getDocs, doc, getDoc } from "firebase/firestore";
import { auth, firestore } from "@/lib/firebase";
import type { PermissionConfig } from "./usePermissions";
import { isLocalOnlyMode } from "@/lib/localMode";
import {
  getLocalCompanyById,
  listLocalCompanies,
  localCompanyRowIsDeleted,
  removeLocalCompanyById,
  upsertLocalCompany,
} from "@/lib/localCompanyStore";
import { mergeSharedWithIntoLocalCompanyUsers, parseLocalCompanyUserRows } from "@/lib/localCompanyUsers";
import { higherPlanByTier, normalizePlanIdForClient, planTierIndex, type PlanId } from "@/config/plans";
import type { BillingFrozenPlanSnapshot } from "@/lib/billingFrozenPlanSnapshots";
import { useLivePlans, getPlanFromPlans } from "@/hooks/useLivePlans";
import type { CompanyDemoteReason } from "@/lib/companyDemote";
import { isCurrentUserOwnerOfCompanyRow, reconcileOnlineMirrorsWithServer } from "@/lib/companyOnlineIntegrity";
import { BUMP_LOCAL_COMPANY_REGISTRY_EVENT } from "@/lib/applyStripePlanToLocalCompany";
import { clearCompanyPlanLocalCache, readCompanyPlanLocalCache } from "@/lib/companyPlanLocalCache";
import {
  syncCompanyPlanFromServer,
  markDailyAuthoritativePlanSyncDone,
  PLAN_SERVER_SYNC_INTERVAL_MS,
  recomputePlanSyncBannerState,
  shouldRunDailyAuthoritativePlanSync,
  type PlanSyncBannerState,
  type SyncCompanyPlanResult,
} from "@/lib/companyPlanServerSync";
import {
  getEffectiveNotificationSettings,
  NOTIFICATION_PREFS_CHANGED_EVENT,
} from "@/lib/localUserNotificationSettings";
import { getLocalFiscalSplitOrDefaults, LOCAL_FISCAL_SPLIT_CHANGED_EVENT } from "@/lib/localFiscalSplitStore";
import { getSuperAdminEmails } from "@/lib/superAdminEmails";
import { filterSharedOnlyCompaniesForSuperAdminInMainApp } from "@/lib/companySuperAdminFilter";
import { clearSelectedCompanyId, readSelectedCompanyId, writeSelectedCompanyId } from "@/lib/selectedCompanyStorage";
import { shouldSuppressTransientCompanyClear, shouldDeferMissingCompanyRedirectNative } from "@/lib/apkLedgerRouteShield";
import { plDbgCompanyRecovery } from "@/lib/plDebugCompanyRecovery";
import { plNavDbg, plNavDbgCritical, plNavDbgIdHint } from "@/lib/plNavRedirectDebug";
import { isStaticAppBuild } from "@/lib/isStaticAppBuild";
import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";
import { shouldSkipEmbeddedStartupAuthChurn } from "@/lib/embeddedWarmBootstrapFlags";

export type DisplaySettings = {
    showDebit?: boolean;
    showCredit?: boolean;
    showBalance?: boolean;
    showTotalDebit?: boolean;
    showTotalCredit?: boolean;
    /** Poori app me date reference: AD, BS, ya dono (toolbar / forms / recurring labels). */
    calendarDateSystem?: "AD" | "BS" | "Both";
};

/** Per-type notification visibility: master on/off + where to show (entity pages, list pages, transaction rows). */
export type NotificationTypeSettings = {
    on?: boolean;
    onEntity?: boolean;
    onList?: boolean;
    onTransaction?: boolean;
};

/** When on, admin (company owner) receives alerts. onEntity = sidebar Messages menu, onTabs = Alerts tab badge, onList = chat/conversation list. */
export type TransactionAlertsSettings = {
    on?: boolean;
    onEntity?: boolean;
    onTabs?: boolean;
    onList?: boolean;
};

export type NotificationSettings = {
    approve?: NotificationTypeSettings;
    message?: NotificationTypeSettings;
    transactionAlerts?: TransactionAlertsSettings;
};

export type IdSettings = {
    party?: boolean;
    bank?: boolean;
    staff?: boolean;
    tax?: boolean;
    item?: boolean;
}

export type HandoverInfo = {
  email: string;
  initiatedAt: Timestamp;
};

export type Company = {
    id: string;
    name: string;
    address?: string;
    pan?: string;
    phone?: string;
    email?: string;
    logoUrl?: string | null;
    password?: string;
    /** Company Profile — offline/shared cloud unlock ke liye (Firestore doc). */
    adminUsername?: string | null;
    ownerId: string;
    ownerEmail?: string;
    sharedWith?: any[];
    sharedWithEmails?: string[];
    permissionConfig?: PermissionConfig;
    fiscalYearStart?: Timestamp;
    fiscalYearEnd?: Timestamp;
    voucherPrefixes?: Record<string, string[]>;
    autoVoucherNumbering?: Record<string, boolean>;
    allowVoucherNumberEditing?: Record<string, boolean>;
    enableVoucherPrefixSelection?: Record<string, boolean>;
    allowRateEditing?: Record<string, boolean>;
    idSettings?: IdSettings;
    backDateEntryDays?: number;
    backDateEditDays?: number;
    backDateDeleteDays?: number;
    decimalPlaces?: number;
    showDrCr?: boolean;
    showCurrencySymbol?: boolean;
    /** Currency symbol to display (e.g. "Rs.", "₹", "$"). Default "Rs." */
    currencySymbol?: string;
    /** ISO 4217 — country se default; company profile currency dropdown se override. */
    currencyCode?: string;
    displaySettings?: DisplaySettings;
    isApprovalEnabled?: boolean;
    isOwned?: boolean;
    planId?: string;
    planExpiry?: Timestamp;
    /** Firestore / SQLite mirror — billing + offline sync ke liye numeric expiry (Timestamp ke saath). */
    planExpiryMs?: number;
    /** Active Stripe subscription id — expiry miss par server `current_period_end` se repair. */
    stripeSubscriptionId?: string;
    /** Owner billing checkbox — `invoice.payment_failed` par 3 din grace + notice (Stripe subscription). */
    billingAutoRenew?: boolean;
    billingAutoRenewFailureNoticeEn?: string;
    billingAutoRenewFailureNoticeUntilMs?: number;
    /**
     * Paid expiry ke baad renew na ho to Basic — default ON; owner billing se `false` kar sakta hai.
     * Server `sync-plan` par `applyExpiredPaidPlanAutoDowngrade` is flag ko dekhta hai.
     */
    autoDowngradeToBasicWhenExpired?: boolean;
    /** Set when a paid plan is applied (Stripe fulfill); good proxy for “joined” paid subscription date. */
    planUpgradedAt?: Timestamp;
    /** Paid upgrade ke waqt chhode hue tier ka usage/credit snapshot — UI frozen pills + server truth. */
    billingFrozenUsageLedger?: BillingFrozenPlanSnapshot[];
    /** In tiers par downgrade / “Just change plan” block (e.g. Advance lock after Advance→Pro). */
    billingBlockedDowngradePlanIds?: string[];
    settings?: Record<string, boolean>;
    allowAttachments?: boolean;
    isDeleted?: boolean; 
    /** Admin recycle-bin hidden marker: normal app company list se always hide. */
    movedToAdminRecycleAt?: unknown;
    handoverTo?: string | null;
    handoverStatus?: 'pending' | 'accepted' | null;
    handoverInitiatedAt?: Timestamp | null;
    storageOption?: 'firebase' | 'drive' | 'local';
    /** Firestore mirror / SQLite row: company cloud se aayi */
    syncedFromCloud?: boolean;
    /** Local-first: online vs offline sync mode (company root). */
    syncPolicy?: 'online' | 'offline';
    /** Jab Firestore doc missing / access lost — local-only demote timestamp. */
    demotedFromOnlineAt?: number;
    /** Demote ka reason — UI info banner + I-icon copy. */
    demoteReason?: CompanyDemoteReason;
    /** Enable "Link Payment to Txns" feature (allocate payment to invoices). */
    enableLinkPaymentToTxns?: boolean;
    /** Header "Copy ledger" + cross-company party ledger tools — role `copy_ledger_cross_company` bhi chahiye. */
    enableCrossCompanyLedgerCopy?: boolean;
    /** Country selected when company was created (e.g. Nepal for VAT reports). */
    country?: string;
    /** Approve & message notification on/off and where to show (entity, list, transaction). */
    notificationSettings?: NotificationSettings;
    /** Tracked usage for plan limits (bytes). */
    attachmentsUsedBytes?: number;
    storageUsedBytes?: number;
    /** If false, shared users can only use one device; when they log in on a new device, they must log out from this device or replace the old one. Plan max devices still applies. */
    userCanUseMultiDevice?: boolean;
    /** Plan-wise: enable voucher edit history. Company can further toggle. */
    voucherHistoryEnabled?: boolean;
    /** Max history entries per voucher (capped by plan). */
    voucherHistoryLimit?: number;
    /** When history full: block_edit = disallow edit; allow_edit_delete_last = allow edit, overwrite oldest. */
    voucherHistoryFullBehavior?: 'block_edit' | 'allow_edit_delete_last';
    /** Recurring auto vouchers: app-open month-end generator controls. */
    recurringVoucherSettings?: {
      enabled?: boolean;
      runScope?: "owner_only" | "all_users" | "selected_users";
      allowedUserIds?: string[];
      /** Voucher dialog: Auto Monthly strip + nested settings + Generate now — `configure_company_settings` ke andar kaun. */
      voucherAutoEditorsScope?: "all_configure_users" | "owner_only" | "selected_users";
      voucherAutoEditorsUserIds?: string[];
    };
    /** Firestore `companies/{id}` — local SQLite id alag ho to sync-plan yahan se */
    authoritativeCompanyId?: string;
    /** Server offline-license window end (`sync-plan` har online + max 20d chunk) */
    offlineLicenseValidUntilMs?: number;
    /**
     * Fiscal split — UI me `localFiscalSplitStore` se merge; Firestore company doc par ye fields persist nahi.
     * `getFiscalMergePartitionDateFromCompany` / ledger divider isi pe chalta hai.
     */
    fiscalSplitMode?: "off" | "merge" | "separate";
    fiscalMergePartitionAt?: Timestamp | { toDate: () => Date } | null;
    fiscalPartitionLabel?: string | null;
    /** Sale/Purchase line "+ Add unit" — persisted labels (deduped) for dropdown without retyping. */
    customUnits?: string[];
    /**
     * Server backup (outbox flush): same `companies/{id}/subcollections` paths; payload AES-GCM in `plEncrypted*` fields.
     * Default OFF. Key material comes from the company login session (username+password → sessionStorage), not a separate passphrase.
     */
    encryptServerBackup?: boolean;
    /** PBKDF2 salt (base64 on company doc); combined with session-derived key from successful local login. */
    encryptServerBackupSalt?: string;
};

/** Main app visibility guard: recycle-bin hidden/admin-hidden company selector me na aaye. */
function isCompanyVisibleInMainApp(row: { isDeleted?: unknown; movedToAdminRecycleAt?: unknown }): boolean {
  return row.isDeleted !== true && row.movedToAdminRecycleAt == null;
}

/** Firestore row + device-local fiscal split — Cloud ko bina likhe tables/sort ko ek hi ` company` shape. */
function mergeCompanyWithLocalFiscal(base: Company | null, cid: string | null): Company | null {
  if (!base) return null;
  const local = getLocalFiscalSplitOrDefaults(cid ?? base.id);
  const iso = local.fiscalMergePartitionAtIso;
  return {
    ...base,
    fiscalSplitMode: local.fiscalSplitMode,
    fiscalMergePartitionAt:
      local.fiscalSplitMode === "merge" && iso ? { toDate: () => new Date(iso) } : null,
    fiscalPartitionLabel: local.fiscalPartitionLabel,
  };
}

/** Stripe / SQLite / Firestore mix: expiry compare ke liye ms */
function planExpiryMsFromCompanyShape(c: Company): number | null {
  const a = c as unknown as { planExpiryMs?: unknown };
  if (typeof a.planExpiryMs === "number" && Number.isFinite(a.planExpiryMs)) return a.planExpiryMs;
  const pe = c.planExpiry;
  if (pe && typeof (pe as Timestamp).toMillis === "function") return (pe as Timestamp).toMillis();
  return null;
}

/** Company doc (Firestore `doc.data()` ya SQLite JSON) se last-write ms — cloud mirror stale overwrite avoid. */
function companyDocUpdatedAtMs(row: Record<string, unknown>): number {
  const u = row.updatedAt;
  if (u != null && typeof u === "object" && "toMillis" in u && typeof (u as { toMillis?: () => number }).toMillis === "function") {
    try {
      const ms = (u as { toMillis: () => number }).toMillis();
      return typeof ms === "number" && Number.isFinite(ms) ? ms : 0;
    } catch {
      return 0;
    }
  }
  if (typeof u === "number" && Number.isFinite(u)) return u;
  return 0;
}

/**
 * Same companyId par Firestore snapshot + SQLite mirror — listener pe cloud Basic aur local Pro race;
 * local paid / nayi expiry UI me overlay (local-first company + paid edge).
 */
function mergeOnlineCompanyWithLocalPlanOverlay(online: Company, localNorm: Company): Company {
  const raw = localNorm as unknown as {
    storageOption?: string;
    syncPolicy?: string;
    syncedFromCloud?: boolean;
    planExpiryMs?: number;
    planUpgradedAtMs?: number;
    lastStripeCheckoutSessionId?: string;
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    authoritativeCompanyId?: string;
    offlineLicenseValidUntilMs?: number;
  };
  const le = planExpiryMsFromCompanyShape(localNorm);
  const oe = planExpiryMsFromCompanyShape(online);
  const lp = normalizePlanIdForClient(localNorm.planId);
  const op = normalizePlanIdForClient(online.planId);
  const onlineUpMs =
    typeof (online as unknown as { planUpgradedAtMs?: unknown }).planUpgradedAtMs === "number" &&
    Number.isFinite((online as unknown as { planUpgradedAtMs: number }).planUpgradedAtMs)
      ? (online as unknown as { planUpgradedAtMs: number }).planUpgradedAtMs
      : 0;
  const localUpMs =
    typeof raw.planUpgradedAtMs === "number" && Number.isFinite(raw.planUpgradedAtMs) ? raw.planUpgradedAtMs : 0;
  // Admin / sync-plan ne Firestore par naya `planUpgradedAtMs` likha ho — SQLite purana paid tier mat chipkao (billing UI turant sahi).
  if (onlineUpMs > localUpMs) return online;
  // Tier Firestore par neeche (demote) lekin SQLite ab bhi upar — server authoritative.
  if (planTierIndex(op) < planTierIndex(lp)) return online;

  const isLocalFirst =
    raw?.storageOption === "local" ||
    raw?.syncPolicy === "offline" ||
    raw?.syncedFromCloud !== true;
  let useLocal = false;
  if (isLocalFirst) useLocal = true;
  // HATA: `localPaid && onlineBasic` — Firestore downgrade/basic authoritative ho tab bhi purana SQLite pro-plus `higherPlanByTier` se chipak jata tha (checkout vs profile mismatch).
  else if (le != null && oe != null && le > oe) useLocal = true;
  else if (le != null && oe == null) useLocal = true;

  if (!useLocal) return online;

  // Firestore `basic` + online-style row: stale SQLite paid tier merge mat karo (`isLocalFirst` galat true ho to bhi).
  if (op === "basic" && String(raw.storageOption || "").toLowerCase() !== "local") {
    return online;
  }

  // SQLite `basic` + Firestore `pro-plus` jab `isLocalFirst` galat true ho (purana mirror flags) — sirf local planId mat chipkao;
  // dono me se zyada tier lo taaki shared user owner subscription dekh sake.
  const mergedPlan = {
    ...online,
    planId: higherPlanByTier(online.planId, localNorm.planId),
    planExpiry: localNorm.planExpiry ?? online.planExpiry,
    ...(typeof raw.planExpiryMs === "number" ? { planExpiryMs: raw.planExpiryMs } : {}),
    ...(typeof raw.planUpgradedAtMs === "number" ? { planUpgradedAtMs: raw.planUpgradedAtMs } : {}),
    ...(raw.lastStripeCheckoutSessionId ? { lastStripeCheckoutSessionId: raw.lastStripeCheckoutSessionId } : {}),
    ...(raw.stripeCustomerId ? { stripeCustomerId: raw.stripeCustomerId } : {}),
    ...(raw.stripeSubscriptionId ? { stripeSubscriptionId: raw.stripeSubscriptionId } : {}),
    ...(raw.authoritativeCompanyId ? { authoritativeCompanyId: raw.authoritativeCompanyId } : {}),
    ...(typeof raw.offlineLicenseValidUntilMs === "number"
      ? { offlineLicenseValidUntilMs: raw.offlineLicenseValidUntilMs }
      : {}),
  } as Company;

  // SQLite me `storageOption: local` (restore/offline) — Firestore row me abhi bhi "firebase" ho sakta hai; spread se merged list galat ho jati thi → sync upsert + vouchers cloud path = data "gayab"
  if (String(raw.storageOption || "").toLowerCase() === "local") {
    return {
      ...mergedPlan,
      storageOption: "local",
      syncPolicy: (raw.syncPolicy as string) || "offline",
      syncedFromCloud: false,
      demoteReason: (localNorm as { demoteReason?: string }).demoteReason,
      demotedFromOnlineAt: (localNorm as { demotedFromOnlineAt?: number }).demotedFromOnlineAt,
    } as Company;
  }

  return mergedPlan;
}

type CompanyContextType = {
  companyId: string | null;
  company: Company | null;
  allCompanies: Company[];
  loading: boolean;
  /** Light tick: plan-banner + online Firestore listeners re-attach (company root / sharing change). */
  triggerSync: () => void;
  /** Static/local-only: poori company list + cloud mirror dubara — party/voucher save par mat chalao. */
  reloadLocalCompanyRegistry: () => void;
  /** Local-only registry reload counter — SQLite company row refresh (e.g. Edit Company “Existing users”). */
  localCompanyRegistryEpoch: number;
  setCompanyId: (companyId: string) => void;
  clearCompanyId: () => void;
  /** Server → local sync UX: 3d stale, 20d “go online”, offline license expiry */
  planAuthoritativeSync: PlanSyncBannerState;
  /** Manual: POST `/api/company/sync-plan` → SQLite overwrite + banner; avatar “Sync plan” se. */
  refreshAuthoritativePlan: () => Promise<SyncCompanyPlanResult>;
  /** LocalStorage + current user: badges/sidebar — Firestore company row sirf fallback (unsynced company bhi). */
  effectiveNotificationSettings: NotificationSettings;
};

// Exporting context so specific surfaces (e.g. voucher dialog) can override `companyId`/`company`
// for nested forms ke save target without touching global app state. Outer pages bina disturb hue rehte hain.
export const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

/** Trailing slash hataune; Next `usePathname()` navigation par 1 frame purana ho sakta hai — `window.location` sath check karo */
function normalizeAppPath(p: string): string {
  return (p || "").replace(/\/+$/, "") || "/";
}

/** Browser URL (Capacitor WebView ma `href` reliable) */
function getBrowserPathname(): string {
  if (typeof window === "undefined") return "";
  try {
    return new URL(window.location.href).pathname || window.location.pathname || "";
  } catch {
    return window.location.pathname || "";
  }
}

/**
 * In routes ma "pick company" push mat karo — Settings + sidebar footer static/APK ma pathname delay hunda timer galat fire hunchha.
 * NOTE: `if (t === "/") return true` harek candidate ma hataeko — mix `["/","/settings"]` ma settings miss hunthyo.
 */
function pathExemptFromAutoSelectCompanyPush(t: string): boolean {
  const p = normalizeAppPath(t);
  if (p === "/not-authorized") return true;
  if (p.startsWith("/company") || p.startsWith("/admin") || p.startsWith("/settings")) return true;
  if (p.startsWith("/messages")) return true;
  if (p.startsWith("/billing")) return true;
  if (p.startsWith("/backup")) return true;
  if (p.startsWith("/import-export")) return true;
  if (p.startsWith("/recycle-bin")) return true;
  if (p.startsWith("/distributor-signup")) return true;
  if (p.startsWith("/embed")) return true;
  return false;
}

function shouldSkipMissingCompanyRedirect(pathA: string, pathB: string): boolean {
  const a = normalizeAppPath(pathA);
  const b = normalizeAppPath(pathB);
  const uniq = a === b ? [a] : [a, b];
  for (const t of uniq) {
    if (pathExemptFromAutoSelectCompanyPush(t)) return true;
  }
  // Hydration / khali path: dubai "/" matra
  if (uniq.every((t) => t === "/")) return true;
  return false;
}

/** Local-first: company switch pe turant SQLite hydrate; Firestore global mirror default ~1.5 min (delete/share revoke). */
const LOCAL_REGISTRY_GLOBAL_MIRROR_DELAY_MS = 90_000;

/** APK/`build:static`/Capacitor: shared companies bhi jaldi registry me — 90s defer se pehle sirf ek row dikhne jaisa UX. */
function embeddedStaticRegistryDeferMs(): number {
  if (isStaticAppBuild()) return 1_600;
  if (typeof window !== "undefined" && isCapacitorNativeApp()) return 1_600;
  return LOCAL_REGISTRY_GLOBAL_MIRROR_DELAY_MS;
}

/** Online shared: list/SQLite race — khali list par 0ms grace = turant clear */
const LIST_RECOVERY_ONLINE_EMPTY_GRACE_MS = 4500;
const LIST_RECOVERY_ONLINE_NONEMPTY_GRACE_MS = 3200;

export const CompanyProvider = ({ children }: { children: ReactNode }) => {
  const [companyId, setCompanyIdState] = useState<string | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  /** Local fiscal split save/tab change — merged `company` dubara banao. */
  const [fiscalLocalEpoch, setFiscalLocalEpoch] = useState(0);
  const [allCompanies, setAllCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  /** Online mode: company doc / sharing change par listener re-subscribe (light). */
  const [registryVersion, setRegistryVersion] = useState(0);
  /** Local-only APK: heavy registry effect sirf jab list/mirror sach me badla ho — registryVersion se alag. */
  const [localRegistryEpoch, setLocalRegistryEpoch] = useState(0);
  const router = useRouter();
  const pathname = usePathname();
  /** Route change par hook deps stable rakhne ke liye — filter + ref; warna local/snapshot effect dubara + setLoading (header company chooser hide). */
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  /** SuperAdmin: merge pehle; pathname sirf filter — alag effect. */
  const latestOnlineMergedUnfilteredRef = useRef<Company[]>([]);
  const latestLocalNormalizedCompaniesRef = useRef<Company[]>([]);
  const { user, customUser, loading: authLoading } = useAuth();
  const ownedSnapRef = useRef<any>(null);
  const sharedSnapRef = useRef<any>(null);
  const ownedByEmailSnapRef = useRef<any>(null);
  /** Doc-snapshot async callback stale company switch na kare — `setCompany` se pehle match karo. */
  const companyIdLiveRef = useRef<string | null>(null);
  /** Deferred Firestore registry mirror cancel — company switch / unmount pe timer clear. */
  const deferredLocalRegistryMirrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** `localRegistryEpoch` pehli value store — mount par mirror nahi; sirf bump par turant mirror. */
  const lastLocalRegistryEpochForMirrorRef = useRef<number | null>(null);
  const isSuperAdmin = customUser?.role === "SuperAdmin";
  const isSuperAdminByEmail = useMemo(() => {
    const e = (user?.email || "").toLowerCase().trim();
    if (!e) return false;
    return getSuperAdminEmails().some((x) => (x || "").toLowerCase().trim() === e);
  }, [user?.email]);
  const isSuperAdminUser = isSuperAdmin || isSuperAdminByEmail;
  /** Local + online dono: `app_settings/plans` merged entitlements (sirf static config/plans nahi). */
  const livePlans = useLivePlans();
  // Har plans-snapshot par naya object → `normalizeLocalCompany` unstable tha → deps wale effects (local registry + Firestore list) bar-bar → useVouchers listeners reset = "auto refresh" feel.
  const livePlansRef = useRef(livePlans);
  livePlansRef.current = livePlans;

  const triggerSync = useCallback(() => {
    // Offline→online: ye bump `useCompany` + `useVouchers` listeners re-bind karta — full reload nahi, lekin "refresh" jaisa.
    if (process.env.NODE_ENV !== "production") {
      console.log("[RELOAD_TRIGGER]", "triggerSync → registryVersion++ (Firestore company queries re-subscribe)");
    }
    setRegistryVersion((v) => v + 1);
  }, []);
  const reloadLocalCompanyRegistry = useCallback(() => {
    if (process.env.NODE_ENV !== "production") {
      console.log("[RELOAD_TRIGGER]", "reloadLocalCompanyRegistry → localRegistryEpoch++ (SQLite mirror bump)");
    }
    setLocalRegistryEpoch((v) => v + 1);
  }, []);

  companyIdLiveRef.current = companyId;

  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ companyId?: string }>).detail;
      if (!d?.companyId || d.companyId === companyId) setFiscalLocalEpoch((n) => n + 1);
    };
    window.addEventListener(LOCAL_FISCAL_SPLIT_CHANGED_EVENT, on as EventListener);
    const onStorage = (ev: StorageEvent) => {
      if (ev.key?.startsWith("pl_fiscal_split_v1_")) setFiscalLocalEpoch((n) => n + 1);
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(LOCAL_FISCAL_SPLIT_CHANGED_EVENT, on as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, [companyId]);

  const [planAuthoritativeSync, setPlanAuthoritativeSync] = useState<PlanSyncBannerState>({
    lastSuccessAtMs: null,
    isStale: false,
    needsOnlinePlanSync: false,
    offlineLicenseValidUntilMs: null,
    offlineLicenseExpired: false,
  });
  /** Har browser par alag — notification settings save par CustomEvent se recompute */
  const [notificationPrefsEpoch, bumpNotificationPrefs] = useState(0);
  useEffect(() => {
    const onEvt = () => bumpNotificationPrefs((n) => n + 1);
    window.addEventListener(NOTIFICATION_PREFS_CHANGED_EVENT, onEvt);
    // Doosri tab me localStorage save — isi browser me effective prefs refresh
    const onStorage = (e: StorageEvent) => {
      if (e.key?.startsWith("pl_notif_v1_")) onEvt();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(NOTIFICATION_PREFS_CHANGED_EVENT, onEvt);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const effectiveNotificationSettings = useMemo(
    () => getEffectiveNotificationSettings(company, user?.uid, companyId),
    [company, companyId, user?.uid, notificationPrefsEpoch]
  );

  useEffect(() => {
    if (!companyId) {
      setPlanAuthoritativeSync({
        lastSuccessAtMs: null,
        isStale: false,
        needsOnlinePlanSync: false,
        offlineLicenseValidUntilMs: null,
        offlineLicenseExpired: false,
      });
      return;
    }
    setPlanAuthoritativeSync(recomputePlanSyncBannerState(companyId, company));
  }, [companyId, registryVersion, company]);

  // Billing success → local SQLite plan patch ke baad list dubara load (offline company).
  useEffect(() => {
    const onBump = () => reloadLocalCompanyRegistry();
    window.addEventListener(BUMP_LOCAL_COMPANY_REGISTRY_EVENT, onBump);
    return () => window.removeEventListener(BUMP_LOCAL_COMPANY_REGISTRY_EVENT, onBump);
  }, [reloadLocalCompanyRegistry]);

  // Track mount time to avoid clearing companyId during initial Firestore load (static/Capacitor race)
  const mountedAtRef = useRef<number>(Date.now());
  /** SQLite recovery merge ke baad dubara full registry bump avoid — ref sirf duplicate recovery guard. */
  const listRecoverySyncForIdRef = useRef<string | null>(null);
  const hasCheckedStorageRef = useRef(false);
  /** Logout par company clear thoda defer — `auth.currentUser` verify (static WebView race). */
  const clearCompanyOnLogoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * Company list `loading` false hone par recovery effect dubara chalane ke liye bump.
   * `loading` ko useEffect deps me mat rakho — Fast Refresh/HMR par deps array size badalne se React error aata hai.
   */
  const [loadingPulse, setLoadingPulse] = useState(0);
  const prevLoadingForRecoveryRef = useRef(loading);
  useEffect(() => {
    if (prevLoadingForRecoveryRef.current && !loading) {
      setLoadingPulse((p) => p + 1);
    }
    prevLoadingForRecoveryRef.current = loading;
  }, [loading]);

  useEffect(() => {
    try {
      // Multi-tab: prefer this tab's saved company so refresh does not jump to another tab's company.
      const storedCompanyId = readSelectedCompanyId();
      if (storedCompanyId && storedCompanyId.trim()) {
        setCompanyIdState(storedCompanyId);
      } else {
        setLoading(false);
      }
    } finally {
      hasCheckedStorageRef.current = true;
    }
  }, []);
  
  const clearCompanyId = useCallback(() => {
    const err = new Error();
    const st = typeof err.stack === "string" ? err.stack.split("\n").slice(1, 10).join(" | ") : "";
    plDbgCompanyRecovery("clearCompanyId", { stackHint: st });
    plNavDbgCritical("useCompany.clearCompanyId", { stackHint: st.slice(0, 400) });
    // Clear both tab override and global fallback when user leaves/deletes the active company.
    clearSelectedCompanyId();
    setCompanyIdState(null);
    setCompany(null);
    setAllCompanies([]);
  }, []);

  const setCompanyId = useCallback((newCompanyId: string) => {
    // Debug: APK par save ke baad company switch race — hr set dikhao (flag ON par only).
    plNavDbg("useCompany.setCompanyId", { hint: plNavDbgIdHint(newCompanyId), len: String(newCompanyId || "").length });
    // Save per-tab selection as well as last-login fallback for new app launches.
    writeSelectedCompanyId(newCompanyId);
    setCompanyIdState(newCompanyId);
  }, []);

  const normalizeLocalCompany = useCallback((raw: Company): Company => {
    // Local-first: planId + Firestore live plans (admin entitlements) — static DEFAULT_PLANS se align karo.
    let planId = normalizePlanIdForClient(raw.planId);
    let rawMs = (raw as unknown as { planExpiryMs?: unknown }).planExpiryMs;
    const sqliteMs = typeof rawMs === "number" && Number.isFinite(rawMs) ? rawMs : null;
    // localStorage plan cache: server sync / Stripe ke baad mirror ne Basic likh diya ho to bhi limits sahi
    let stripeSessionFromPlanCache: string | undefined;
    const cached = readCompanyPlanLocalCache(String(raw.id || ""));
    if (cached) {
      const cp = normalizePlanIdForClient(cached.planId);
      const rawUpRaw = (raw as unknown as { planUpgradedAtMs?: unknown }).planUpgradedAtMs;
      const rawUpMs =
        typeof rawUpRaw === "number" && Number.isFinite(rawUpRaw) ? rawUpRaw : 0;
      const cacheT = cached.updatedAtMs ?? 0;
      const tierFromRow = planTierIndex(planId);
      const tierFromCache = planTierIndex(cp);
      // Firestore par plan switch cache ke baad — ya server tier cache se kam — purana Pro localStorage mat lao (SuperAdmin demote / sync-plan).
      const serverSwitchNewerThanCache = rawUpMs > cacheT;
      const serverTierLowerThanCache = tierFromRow < tierFromCache;
      if (serverSwitchNewerThanCache || serverTierLowerThanCache) {
        clearCompanyPlanLocalCache(String(raw.id || ""));
      } else {
        const sqliteBasic = planId === "basic";
        const cachePaid = cp !== "basic";
        const expBetter = sqliteMs == null || cached.planExpiryMs > sqliteMs;
        if (cachePaid && sqliteBasic) {
          planId = cp;
          rawMs = cached.planExpiryMs;
          stripeSessionFromPlanCache = cached.lastStripeCheckoutSessionId;
        } else if (cachePaid && expBetter && planTierIndex(cp) > planTierIndex(planId)) {
          planId = cp;
          rawMs = cached.planExpiryMs;
          stripeSessionFromPlanCache = cached.lastStripeCheckoutSessionId;
        } else if (cachePaid && expBetter && planTierIndex(cp) === planTierIndex(planId)) {
          rawMs = cached.planExpiryMs;
          stripeSessionFromPlanCache = cached.lastStripeCheckoutSessionId;
        }
      }
    }
    const planExpiryFromMs =
      typeof rawMs === "number" && Number.isFinite(rawMs) ? Timestamp.fromMillis(rawMs) : undefined;
    const plan = getPlanFromPlans(livePlansRef.current, planId as PlanId);
    const ownerEmail = (raw.ownerEmail || "").toLowerCase().trim();
    const currentEmail = (user?.email || "").toLowerCase().trim();
    const ownerId = (raw.ownerId || "").trim();
    const currentUid = (user?.uid || "").trim();
    const sharedEmails = Array.isArray(raw.sharedWithEmails) ? raw.sharedWithEmails : [];
    const isOwnedByCurrentUser =
      (!!ownerId && !!currentUid && ownerId === currentUid) ||
      (!!ownerEmail && !!currentEmail && ownerEmail === currentEmail);
    const isSharedWithCurrentUser =
      !!currentEmail &&
      sharedEmails.some((e) => String(e || "").toLowerCase().trim() === currentEmail);
    return {
      ...raw,
      planId,
      ...(typeof rawMs === "number" && Number.isFinite(rawMs) ? { planExpiryMs: rawMs } : {}),
      ...(planExpiryFromMs ? { planExpiry: planExpiryFromMs } : {}),
      ...(stripeSessionFromPlanCache ? { lastStripeCheckoutSessionId: stripeSessionFromPlanCache } : {}),
      // Keep My/Shared split correct even when company is loaded from local DB mirror.
      isOwned: isOwnedByCurrentUser ? true : !isSharedWithCurrentUser,
      allowAttachments:
        typeof raw.allowAttachments === "boolean"
          ? raw.allowAttachments
          : plan.entitlements.canAddFileImagePdf === true,
      voucherHistoryEnabled:
        typeof raw.voucherHistoryEnabled === "boolean"
          ? raw.voucherHistoryEnabled
          : plan.entitlements.voucherHistoryEnabled === true,
      voucherHistoryLimit:
        typeof raw.voucherHistoryLimit === "number"
          ? raw.voucherHistoryLimit
          : Number(plan.entitlements.voucherHistoryLimit) || 0,
      userCanUseMultiDevice:
        typeof raw.userCanUseMultiDevice === "boolean"
          ? raw.userCanUseMultiDevice
          : plan.entitlements.hasMultiDeviceSync === true,
    } as Company;
  }, [user?.email, user?.uid]);

  /** Local-only heavy path: Firestore owned/shared → SQLite mirror + stale purge; deferred / bump / cold-start ke liye. */
  type LocalRegistryMirrorMode = "deferred" | "immediate-empty" | "registry-bump";
  const performLocalRegistryFirestoreMirror = useCallback(
    async (opts: { mode: LocalRegistryMirrorMode }) => {
      const touchLoading = opts.mode === "immediate-empty";
      if (touchLoading) setLoading(true);
      try {
        let cloudMirrorAllowedIds: Set<string> | null = null;
        if (user?.uid && user?.email) {
          try {
            const ownedSnap = await getDocs(query(collection(firestore, "companies"), where("ownerId", "==", user.uid)));
            const sharedSnap = await getDocs(query(collection(firestore, "companies"), where("sharedWithEmails", "array-contains", user.email)));
            const mergedDocs = [...ownedSnap.docs, ...sharedSnap.docs];
            cloudMirrorAllowedIds = new Set(mergedDocs.map((d) => String(d.id || "")).filter(Boolean));
            for (const d of mergedDocs) {
              const raw = { id: d.id, ...(d.data() || {}) } as Record<string, unknown>;
              const rid = String(raw.id ?? "");
              if (!rid) continue;
              const isCloudDeleted = raw.isDeleted === true;
              const existing = await getLocalCompanyById(rid, { includeDeleted: true });
              const localMs =
                typeof (existing as unknown as { updatedAt?: unknown })?.updatedAt === "number"
                  ? (existing as unknown as { updatedAt: number }).updatedAt
                  : 0;
              const cloudMs = companyDocUpdatedAtMs(raw);
              if (existing && String((existing as { storageOption?: string }).storageOption || "").toLowerCase() === "local") {
                continue;
              }
              if (existing && localMs > cloudMs) continue;
              const firestoreSharedWith = Array.isArray(raw.sharedWith) ? raw.sharedWith : [];
              const prevUsers = existing
                ? parseLocalCompanyUserRows((existing as { localCompanyUsers?: unknown }).localCompanyUsers)
                : [];
              const mergedLocalUsers = mergeSharedWithIntoLocalCompanyUsers(prevUsers, firestoreSharedWith as any);
              if (isCloudDeleted) {
                await upsertLocalCompany({
                  ...(raw as Record<string, unknown>),
                  id: rid,
                  isDeleted: true,
                  storageOption: "firebase",
                  syncPolicy: "online",
                  syncedFromCloud: true,
                  localCompanyUsers: mergedLocalUsers,
                } as any);
                continue;
              }
              await upsertLocalCompany({
                ...(raw as Record<string, unknown>),
                storageOption: "firebase",
                syncPolicy: "online",
                syncedFromCloud: true,
                localCompanyUsers: mergedLocalUsers,
              } as any);
            }
          } catch {
            cloudMirrorAllowedIds = null;
          }
        }
        // **APK airplane / flaky net:** Firestore query kabhi-success + `docs: []` de sakta hai cache miss par — khali Set = sab ids "ghost" ⇒ pura registry wipe (“no company”). Sirf tab purge jab kam se kam ek server id pakka mile.
        if (
          cloudMirrorAllowedIds !== null &&
          cloudMirrorAllowedIds.size > 0 &&
          user?.uid &&
          user.email
        ) {
          const locals = await listLocalCompanies({ includeDeleted: true });
          for (const row of locals) {
            const id = row.id;
            if (!id || cloudMirrorAllowedIds.has(id)) continue;
            const isOwner = isCurrentUserOwnerOfCompanyRow(row, { uid: user.uid, email: user.email });
            const isPureLocalRow = String((row as { storageOption?: string }).storageOption || "").toLowerCase() === "local";
            if (isOwner && isPureLocalRow) continue;
            if (localCompanyRowIsDeleted(row)) continue;
            await removeLocalCompanyById(id, { firebaseUid: user.uid });
          }
        }
        const localCompanies = await listLocalCompanies();
        const normalizedLocalCompanies = localCompanies
          .map((c) => normalizeLocalCompany(c as unknown as Company))
          .filter(isCompanyVisibleInMainApp);
        await Promise.all(normalizedLocalCompanies.map((c) => upsertLocalCompany(c as any)));
        latestLocalNormalizedCompaniesRef.current = normalizedLocalCompanies;
        const filteredLocals = filterSharedOnlyCompaniesForSuperAdminInMainApp(
          normalizedLocalCompanies,
          user,
          isSuperAdminUser,
          pathnameRef.current
        );
        plDbgCompanyRecovery("performLocalRegistryFirestoreMirror:setList", {
          mode: opts.mode,
          count: filteredLocals.length,
          idsSample: filteredLocals.slice(0, 8).map((c) => c.id),
          liveCompanyId: companyIdLiveRef.current,
          ledgerShield: shouldSuppressTransientCompanyClear(),
        });
        setAllCompanies(filteredLocals);
        const liveId = companyIdLiveRef.current;
        if (!liveId) {
          setCompany(null);
          return;
        }
        const selected = await getLocalCompanyById(liveId);
        const norm = selected ? normalizeLocalCompany(selected as unknown as Company) : null;
        if (!norm || !isCompanyVisibleInMainApp(norm)) {
          // Save/outbox: SQLite read null — pehle clear mat karo (`shouldSuppress…` me ledger shield ~26s)
          if (shouldSuppressTransientCompanyClear()) {
            plDbgCompanyRecovery("performLocalRegistryFirestoreMirror:selectedInvisible:shieldHold", {
              liveId,
              ledgerShield: true,
            });
            return;
          }
          plDbgCompanyRecovery("performLocalRegistryFirestoreMirror:selectedInvisible:clearAndPush", {
            liveId,
            hasNormRow: Boolean(norm),
          });
          clearCompanyId();
          const p = normalizeAppPath(pathnameRef.current ?? "");
          if (!pathExemptFromAutoSelectCompanyPush(p)) {
            plNavDbgCritical("useCompany.router.push./company [performLocalRegistry]", {
              pathname: p,
              liveIdHint: String(liveId || "").slice(0, 8),
            });
            router.push("/company");
          }
          return;
        }
        setCompany(norm);
      } finally {
        if (touchLoading) setLoading(false);
      }
    },
    [user, normalizeLocalCompany, isSuperAdminUser, clearCompanyId, router]
  );

  /**
   * Firestore authoritative plan → SQLite / plan cache (POST sync-plan).
   * `recordDailySuccess`: sirf calendar-day idle sync — dubara POST avoid (load kam).
   */
  const refreshAuthoritativePlan = useCallback(
    async (options?: { recordDailySuccess?: boolean }): Promise<SyncCompanyPlanResult> => {
      if (!user || !companyId?.trim() || authLoading) {
        return { ok: false, applied: false, reason: "no_context" };
      }
      const row = await getLocalCompanyById(companyId);
      const firebaseCompanyId =
        String(row?.authoritativeCompanyId || companyId).trim() || companyId;
      const r = await syncCompanyPlanFromServer({
        firebaseCompanyId,
        localCompanyId: companyId,
        getIdToken: () => user.getIdToken(),
      });
      const rowAfter = await getLocalCompanyById(companyId);
      if (rowAfter && r.ok && r.applied) {
        const norm = normalizeLocalCompany(rowAfter as unknown as Company);
        setCompany((prev) => (prev?.id === companyId ? norm : prev));
        setAllCompanies((prev) => {
          const idx = prev.findIndex((c) => c.id === companyId);
          if (idx < 0) return prev;
          const next = [...prev];
          next[idx] = norm;
          return next;
        });
      }
      setPlanAuthoritativeSync(
        recomputePlanSyncBannerState(companyId, rowAfter as { offlineLicenseValidUntilMs?: number } | null)
      );
      if (r.ok && options?.recordDailySuccess && user.uid) {
        markDailyAuthoritativePlanSyncDone(user.uid);
      }
      return r;
    },
    [user, companyId, authLoading, normalizeLocalCompany]
  );

  /** Login + selected company: server → local plan + offline license; `normalizeLocalCompany` ke baad hook order safe. */
  const planSyncBurstRef = useRef(0);
  const planPeriodicSyncInFlightRef = useRef(false);
  useEffect(() => {
    if (!user || !companyId || authLoading) return;

    let cancelled = false;

    const runDailyIdleSync = () => {
      if (cancelled) return;
      if (!user.uid || !shouldRunDailyAuthoritativePlanSync(user.uid)) return;
      void refreshAuthoritativePlan({ recordDailySuccess: true });
    };

    const runOnlineSync = () => {
      if (cancelled) return;
      void refreshAuthoritativePlan();
    };

    planSyncBurstRef.current = 0;
    // APK/static: pehli full warm ke baad startup par `getIdToken`/plan API attachment prefetch se race na karein — sync sirf `online` + deferred.
    const embeddedClient =
      isStaticAppBuild() || (typeof window !== "undefined" && isCapacitorNativeApp());
    const skipIdlePlanSyncBoot =
      isLocalOnlyMode() &&
      embeddedClient &&
      shouldSkipEmbeddedStartupAuthChurn(user?.uid, auth.currentUser?.uid);
    // Embedded local-first: offline→online transition par immediate plan-sync rerender ko avoid karo (refresh-like jump).
    // Web "Local" data source bhi: `window` `online` par turant POST/auth churn na ho — session + SQLite pehle se theek.
    const skipOnlinePlanSyncForLocalOnly = isLocalOnlyMode();

    /** Online + selected company: har 5 min server se planId/expiry refresh (overlap skip). */
    const runPeriodicOnlinePlanSync = () => {
      if (cancelled || planPeriodicSyncInFlightRef.current) return;
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      if (skipOnlinePlanSyncForLocalOnly) return;
      planPeriodicSyncInFlightRef.current = true;
      void refreshAuthoritativePlan().finally(() => {
        planPeriodicSyncInFlightRef.current = false;
      });
    };

    // Browser timer ids — `NodeJS.Timeout` union avoid (tsc DOM vs @types/node)
    let planSyncIdleCallbackId: number | undefined;
    let planSyncIdleFallbackTimerId: number | undefined;
    let deferredLazyPlanTimer: number | null = null;
    let planPeriodicIntervalId: number | undefined;
    if (typeof window === "undefined") {
      return () => {
        cancelled = true;
      };
    }
    const win = window;

    if (!skipIdlePlanSyncBoot) {
      // Startup: idle par **calendar-day** gate — din me ek baar automatic overwrite (extra POST kam).
      if ("requestIdleCallback" in win && typeof win.requestIdleCallback === "function") {
        planSyncIdleCallbackId = win.requestIdleCallback(() => runDailyIdleSync(), { timeout: 2500 });
      } else {
        planSyncIdleFallbackTimerId = win.setTimeout(() => runDailyIdleSync(), 1200);
      }
    } else {
      // Continuous online par `online` event nahi aata — ~1 min baad background plan sync (sirf jab aaj ka daily sync pending ho)
      deferredLazyPlanTimer = win.setTimeout(() => runDailyIdleSync(), 60_000);
    }

    const onOnline = () => {
      if (process.env.NODE_ENV !== "production") {
        console.log("[ONLINE_EVENT]", "useCompany:planAuthoritative window online", {
          skipOnlinePlanSyncForLocalOnly,
        });
      }
      if (skipOnlinePlanSyncForLocalOnly) return;
      planSyncBurstRef.current = 0;
      runOnlineSync();
    };

    win.addEventListener("online", onOnline);

    // Online rehne par har 5 min plan sync — `online` event + daily idle ke alawa
    if (!skipOnlinePlanSyncForLocalOnly) {
      planPeriodicIntervalId = win.setInterval(
        runPeriodicOnlinePlanSync,
        PLAN_SERVER_SYNC_INTERVAL_MS
      );
    }

    return () => {
      cancelled = true;
      if (planPeriodicIntervalId !== undefined) {
        win.clearInterval(planPeriodicIntervalId);
        planPeriodicIntervalId = undefined;
      }
      if (deferredLazyPlanTimer != null) {
        win.clearTimeout(deferredLazyPlanTimer);
        deferredLazyPlanTimer = null;
      }
      if (planSyncIdleCallbackId !== undefined && "cancelIdleCallback" in win) {
        try {
          win.cancelIdleCallback(planSyncIdleCallbackId);
        } catch {
          /* ignore */
        }
      }
      if (planSyncIdleFallbackTimerId !== undefined) {
        win.clearTimeout(planSyncIdleFallbackTimerId);
      }
      win.removeEventListener("online", onOnline);
    };
  }, [user, companyId, authLoading, refreshAuthoritativePlan]);

  /** Shared company select: turant server plan → SQLite/cache (owner upgrade ke baad file limit / entitlements). */
  useEffect(() => {
    if (!user?.uid || !companyId?.trim() || authLoading || isLocalOnlyMode()) return;
    const row = allCompanies.find((c) => c.id === companyId);
    if (!row || isCurrentUserOwnerOfCompanyRow(row, { uid: user.uid, email: user.email ?? null })) return;
    void refreshAuthoritativePlan();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- burst sirf company switch par
  }, [companyId, user?.uid, authLoading]);

  // Local-only: turant sirf SQLite se list + selected row; defer mirror default 90s, static/APK/`build:static` par ~1.6s (shared jaldi dikhen).
  useEffect(() => {
    if (!isLocalOnlyMode()) return;
    let cancelled = false;
    if (deferredLocalRegistryMirrorTimerRef.current) {
      clearTimeout(deferredLocalRegistryMirrorTimerRef.current);
      deferredLocalRegistryMirrorTimerRef.current = null;
    }

    void (async () => {
      if (companyId) setLoading(true);
      let needImmediateFullMirror = false;
      try {
        const rawLocals = await listLocalCompanies();
        if (cancelled) return;
        const normalizedLocalCompanies = rawLocals
          .map((c) => normalizeLocalCompany(c as unknown as Company))
          .filter(isCompanyVisibleInMainApp);
        latestLocalNormalizedCompaniesRef.current = normalizedLocalCompanies;
        const filteredFast = filterSharedOnlyCompaniesForSuperAdminInMainApp(
          normalizedLocalCompanies,
          user,
          isSuperAdminUser,
          pathnameRef.current
        );
        plDbgCompanyRecovery("localOnlyRegistry:SQLite:setList", {
          count: filteredFast.length,
          idsSample: filteredFast.slice(0, 8).map((c) => c.id),
          liveCompanyId: companyIdLiveRef.current,
          ledgerShield: shouldSuppressTransientCompanyClear(),
        });
        setAllCompanies(filteredFast);

        if (!companyId) {
          setCompany(null);
          setLoading(false);
          needImmediateFullMirror = normalizedLocalCompanies.length === 0 && !!user?.uid && !!user?.email;
        } else {
          const sel = await getLocalCompanyById(companyId);
          if (cancelled) return;
          if (!sel) {
            needImmediateFullMirror = true;
            setCompany(null);
          } else {
            setCompany(normalizeLocalCompany(sel as unknown as Company));
          }
          setLoading(false);
        }
      } catch {
        if (companyId) setCompany(null);
        setLoading(false);
        needImmediateFullMirror = !!user?.uid && !!user?.email;
      }

      if (cancelled) return;
      if (!user?.uid || !user?.email) return;

      if (needImmediateFullMirror) {
        await performLocalRegistryFirestoreMirror({ mode: "immediate-empty" }).catch(() => {});
      } else {
        deferredLocalRegistryMirrorTimerRef.current = setTimeout(() => {
          deferredLocalRegistryMirrorTimerRef.current = null;
          void performLocalRegistryFirestoreMirror({ mode: "deferred" }).catch(() => {});
        }, embeddedStaticRegistryDeferMs());
      }
    })();

    return () => {
      cancelled = true;
      if (deferredLocalRegistryMirrorTimerRef.current) {
        clearTimeout(deferredLocalRegistryMirrorTimerRef.current);
        deferredLocalRegistryMirrorTimerRef.current = null;
      }
    };
  }, [user, companyId, normalizeLocalCompany, isSuperAdminUser, performLocalRegistryFirestoreMirror]);

  // `reloadLocalCompanyRegistry` bump: turant Firestore mirror (Stripe/demote) + deferred timer cancel taaki double-sync na ho.
  useEffect(() => {
    if (!isLocalOnlyMode()) return;
    if (lastLocalRegistryEpochForMirrorRef.current === null) {
      lastLocalRegistryEpochForMirrorRef.current = localRegistryEpoch;
      return;
    }
    if (lastLocalRegistryEpochForMirrorRef.current === localRegistryEpoch) return;
    lastLocalRegistryEpochForMirrorRef.current = localRegistryEpoch;
    if (deferredLocalRegistryMirrorTimerRef.current) {
      clearTimeout(deferredLocalRegistryMirrorTimerRef.current);
      deferredLocalRegistryMirrorTimerRef.current = null;
    }
    void performLocalRegistryFirestoreMirror({ mode: "registry-bump" }).catch(() => {});
  }, [localRegistryEpoch, performLocalRegistryFirestoreMirror]);

  useEffect(() => {
    if (isLocalOnlyMode()) return;

    if (clearCompanyOnLogoutTimerRef.current) {
      clearTimeout(clearCompanyOnLogoutTimerRef.current);
      clearCompanyOnLogoutTimerRef.current = null;
    }
    if (authLoading) return;
    if (user) {
      if (customUser?.companyId && !companyId) {
        setCompanyId(customUser.companyId);
      }
      return;
    }
    clearCompanyOnLogoutTimerRef.current = setTimeout(() => {
      clearCompanyOnLogoutTimerRef.current = null;
      try {
        if (auth.currentUser) return;
      } catch {
        /* ignore */
      }
      clearCompanyId();
    }, 400);
    return () => {
      if (clearCompanyOnLogoutTimerRef.current) {
        clearTimeout(clearCompanyOnLogoutTimerRef.current);
        clearCompanyOnLogoutTimerRef.current = null;
      }
    };
  }, [user, customUser, companyId, clearCompanyId, setCompanyId, authLoading]);

  const handleSnapshotUpdate = useCallback(async (ownedSnap: any, sharedSnap: any, ownedByEmailSnap?: any, localCompanies?: Company[]) => {
    const isOwnedByUser = (c: Company) =>
      c.ownerId === user?.uid ||
      (!!c.ownerEmail && !!user?.email && c.ownerEmail.toLowerCase().trim() === user.email!.toLowerCase().trim());
    // Server snapshots se admin-hidden rows bhi drop karo so super-admin normal app me na dekhe.
    // Firestore row seedha map: planId alias (`proplus`) + entitlements normalizeLocalCompany se — shared list me pehle hi sahi tier.
    const owned = ownedSnap.docs
      .map((doc: any) => normalizeLocalCompany({ id: doc.id, ...doc.data() } as Company))
      .filter(isCompanyVisibleInMainApp);
    const shared = sharedSnap.docs
      .map((doc: any) => normalizeLocalCompany({ id: doc.id, ...doc.data() } as Company))
      .filter(isCompanyVisibleInMainApp);
    const ownedByEmail =
      ownedByEmailSnap?.docs
        ?.map((doc: any) => normalizeLocalCompany({ id: doc.id, ...doc.data() } as Company))
        .filter(isCompanyVisibleInMainApp) ?? [];

    /** Firestore doc abhi bhi query me hai lekin `isDeleted: true` — SQLite mirror purana ho to merge se dubara list me mat lao */
    const deletedOnFirestore = new Set<string>();
    for (const snap of [ownedSnap, sharedSnap, ownedByEmailSnap]) {
      snap?.docs?.forEach((doc: { id: string; data: () => Record<string, unknown> }) => {
        const d = doc.data() || {};
        if (d?.isDeleted === true || d?.movedToAdminRecycleAt != null) deletedOnFirestore.add(doc.id);
      });
    }

    const companyMap = new Map<string, Company>();
    owned.forEach((c: Company) => companyMap.set(c.id, { ...c, isOwned: true, ownerId: c.ownerId || user?.uid || '', ownerEmail: c.ownerEmail || user?.email || '' }));
    ownedByEmail.forEach((c: Company) => {
      if (!companyMap.has(c.id)) companyMap.set(c.id, { ...c, isOwned: true });
    });
    shared.forEach((c: Company) => {
        if (!companyMap.has(c.id)) {
            companyMap.set(c.id, { ...c, isOwned: isOwnedByUser(c) });
        }
    });
    // Merge local DB companies — live plan entitlements ke liye normalizeLocalCompany (online jaisa).
    for (const c of localCompanies || []) {
      if (deletedOnFirestore.has(c.id)) continue;
      const normalized = normalizeLocalCompany(c);
      const existing = companyMap.get(c.id);
      if (!existing) {
        const row = c as unknown as import("@/lib/localCompanyStore").LocalCompanyDoc;
        if (
          user?.uid &&
          !isCurrentUserOwnerOfCompanyRow(row, { uid: user.uid, email: user?.email ?? null })
        ) {
          // Owner/shared Firestore lists me ab nahi — access revoke; device se poora company data hatao
          await removeLocalCompanyById(c.id, { firebaseUid: user.uid });
          continue;
        }
        companyMap.set(c.id, normalized);
      } else {
        companyMap.set(c.id, mergeOnlineCompanyWithLocalPlanOverlay(existing as Company, normalized));
      }
    }

    let mergedCompanies = Array.from(companyMap.values());
    latestOnlineMergedUnfilteredRef.current = mergedCompanies;
    mergedCompanies = filterSharedOnlyCompaniesForSuperAdminInMainApp(
      mergedCompanies,
      user,
      isSuperAdminUser,
      pathnameRef.current
    );
    plDbgCompanyRecovery("handleSnapshotUpdate:setList", {
      mergedCount: mergedCompanies.length,
      idsSample: mergedCompanies.slice(0, 12).map((c) => c.id),
      liveCompanyId: companyIdLiveRef.current,
      selectedVisibleInMerged: (() => {
        const id = companyIdLiveRef.current;
        if (!id) return null;
        const row = mergedCompanies.find((c) => c.id === id);
        return row ? isCompanyVisibleInMainApp(row) : false;
      })(),
      ledgerShield: shouldSuppressTransientCompanyClear(),
    });
    // Sync engine: persist all online-category companies to local DB on every server snapshot update.
    const onlineCompanies = mergedCompanies.filter(
      (c) => ((c.storageOption || "firebase") as string).toLowerCase() !== "local"
    );
    // IMPORTANT: company selector/active company ko mirror writes ka wait na karna pade.
    // Pehle UI list hydrate karo, phir SQLite mirror writes background me chalao.
    setAllCompanies(mergedCompanies);
    setLoading(false);
    void Promise.all(
      onlineCompanies.map(async (c) => {
        const existing = await getLocalCompanyById(c.id, { includeDeleted: true });
        const prevUsers = existing
          ? parseLocalCompanyUserRows((existing as { localCompanyUsers?: unknown }).localCompanyUsers)
          : [];
        const sw = Array.isArray((c as { sharedWith?: unknown }).sharedWith)
          ? ((c as { sharedWith: unknown[] }).sharedWith as any[])
          : [];
        const mergedLocalUsers = mergeSharedWithIntoLocalCompanyUsers(prevUsers, sw);
        await upsertLocalCompany({
          ...(c as any),
          storageOption: "firebase",
          syncPolicy: "online",
          syncedFromCloud: true,
          localCompanyUsers: mergedLocalUsers,
        } as any);
      })
    ).catch((error) => {
      // Background mirror failure se foreground company load block nahi karna.
      console.warn("Background company mirror sync failed:", error);
    });
  }, [user?.uid, user?.email, normalizeLocalCompany, isSuperAdminUser]);

  useEffect(() => {
    if (isLocalOnlyMode()) {
      // Local-only mode: Firebase company listeners disable (no server dependency).
      return;
    }
    if (!user?.email) {
      setAllCompanies([]);
      if(!authLoading) setLoading(false);
      ownedSnapRef.current = null;
      sharedSnapRef.current = null;
      return;
    };
    
    setLoading(true);
    // Reset refs when user changes
    ownedSnapRef.current = null;
    sharedSnapRef.current = null;

    const ownedQuery = query(collection(firestore, "companies"), where("ownerId", "==", user.uid));
    const sharedQuery = query(collection(firestore, "companies"), where("sharedWithEmails", "array-contains", user.email));

    const needsOwnedByEmail = isSuperAdmin;
    /** Offline / slow Firestore: dono snapshot refs null reh sakte — pehle `listLocalCompanies` se trigger bina iske company list + loading kabhi settle nahi hoti (online backup → local restore → refresh par blank). */
    const emptySnap = (): { docs: readonly unknown[] } => ({ docs: [] });
    /** Har snapshot par taaza SQLite — purana cache delete ke baad bhi company dikhata tha; recycle bin move ke baad live list */
    const triggerUpdate = () => {
      void (async () => {
        const owned = ownedSnapRef.current ?? emptySnap();
        const shared = sharedSnapRef.current ?? emptySnap();
        const ownedByEmail = needsOwnedByEmail ? (ownedByEmailSnapRef.current ?? emptySnap()) : undefined;
        let localRows: Company[] = [];
        try {
          localRows = (await listLocalCompanies())
            // SQLite fallback path me bhi same guard rakho (refresh pe hidden row leak na ho).
            .filter((c: any) => isCompanyVisibleInMainApp(c))
            .map((c) => normalizeLocalCompany(c as unknown as Company));
        } catch {
          localRows = [];
        }
        await handleSnapshotUpdate(owned, shared, ownedByEmail, localRows);
      })();
    };

    const unsubOwned = onSnapshot(ownedQuery, (snap) => {
      ownedSnapRef.current = snap;
      triggerUpdate();
    }, (err: any) => {
      if (err?.code === 'permission-denied' || err?.code === 'PERMISSION_DENIED' || String(err?.message || '').includes('permission')) {
        console.warn('[PERMISSION_DENIED TRACK] source=useCompany query=owned (companies where ownerId==uid)', { code: err?.code });
      }
      console.error("Owned Companies listener error:", err);
    });
    
    const unsubShared = onSnapshot(sharedQuery, (snap) => {
      sharedSnapRef.current = snap;
      triggerUpdate();
    }, (err: any) => {
      if (err?.code === 'permission-denied' || err?.code === 'PERMISSION_DENIED' || String(err?.message || '').includes('permission')) {
        console.warn('[PERMISSION_DENIED TRACK] source=useCompany query=shared (companies where sharedWithEmails contains email)', { code: err?.code });
      }
      console.error("Shared Companies listener error:", err);
    });

    const ownedByEmailQuery = isSuperAdminUser && user?.email
      ? query(collection(firestore, "companies"), where("ownerEmail", "==", user.email))
      : null;
    const unsubOwnedByEmail = ownedByEmailQuery
      ? onSnapshot(ownedByEmailQuery, (snap) => {
          ownedByEmailSnapRef.current = snap;
          triggerUpdate();
        }, (err: any) => {
          if (err?.code === 'permission-denied' || err?.code === 'PERMISSION_DENIED') {
            console.warn('[PERMISSION_DENIED TRACK] source=useCompany query=ownedByEmail', { code: err?.code });
          }
          console.error("Owned by email companies listener error:", err);
        })
      : () => {};
    if (!ownedByEmailQuery) ownedByEmailSnapRef.current = null;

    triggerUpdate();

    return () => {
        unsubOwned();
        unsubShared();
        unsubOwnedByEmail();
        ownedSnapRef.current = null;
        sharedSnapRef.current = null;
        ownedByEmailSnapRef.current = null;
    }
}, [user?.email, user?.uid, authLoading, isSuperAdmin, handleSnapshotUpdate, registryVersion]);

  /** Chuni gayi company par direct doc snapshot — collection+SQLite merge se settings live na aane ki gap band (khula voucher + doosra tab/admin). */
  useEffect(() => {
    if (isLocalOnlyMode()) return;
    if (!companyId?.trim() || !user?.uid) return;

    let cancelled = false;
    const ref = doc(firestore, "companies", companyId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        void (async () => {
          if (!snap.exists()) return;
          const data = snap.data() || {};
          if (data.isDeleted === true || data.movedToAdminRecycleAt != null) return;

          const raw = { id: snap.id, ...data } as Company;
          const onlineNorm = normalizeLocalCompany(raw);
          let merged: Company = onlineNorm;
          try {
            const localRow = await getLocalCompanyById(companyId);
            if (localRow && !cancelled) {
              merged = mergeOnlineCompanyWithLocalPlanOverlay(
                onlineNorm,
                normalizeLocalCompany(localRow as unknown as Company)
              );
            }
          } catch {
            merged = onlineNorm;
          }
          if (cancelled || merged.id !== companyIdLiveRef.current) return;

          setCompany(merged);
          plDbgCompanyRecovery("activeCompanyDoc:listRowMerge", {
            companyId: merged.id,
            isDeleted: merged.isDeleted === true,
            movedToRecycle: merged.movedToAdminRecycleAt != null,
          });
          setAllCompanies((prev) => {
            const i = prev.findIndex((c) => c.id === merged.id);
            if (i < 0) return prev;
            const next = [...prev];
            next[i] = merged;
            return next;
          });
        })();
      },
      (err: unknown) => {
        const code =
          err && typeof err === "object" && "code" in err ? String((err as { code?: unknown }).code) : "";
        if (code === "permission-denied" || code === "PERMISSION_DENIED") {
          console.warn("[PERMISSION_DENIED TRACK] source=useCompany doc=companies/{companyId}", { companyId });
        }
        console.error("Active company doc listener error:", err);
      }
    );

    return () => {
      cancelled = true;
      unsub();
    };
  }, [companyId, user?.uid, normalizeLocalCompany]);

  // Har "online" SQLite row ke liye Firestore root verify: doc gayab → owner = local me demote, shared = row delete.
  useEffect(() => {
    if (!user?.uid || authLoading) return;
    let cancelled = false;
    const selectedAtStart = companyId;
    (async () => {
      const result = await reconcileOnlineMirrorsWithServer({
        uid: user.uid,
        email: user.email ?? null,
      });
      if (cancelled) return;
      if (selectedAtStart && result.removedIds.includes(selectedAtStart)) {
        if (shouldSuppressTransientCompanyClear()) {
          plDbgCompanyRecovery("reconcileOnline:selectedRemoved:shieldHold", { selectedAtStart });
          plNavDbg("useCompany.reconcileOnline:shieldHold skip clear", { selectedAtStart });
          return;
        }
        plDbgCompanyRecovery("reconcileOnline:selectedRemoved:clear+pushCompany", { selectedAtStart });
        plNavDbgCritical("useCompany.router.push./company [reconcileOnlineMirrors]", { selectedAtStart });
        if (process.env.NODE_ENV !== "production") {
          console.log("[RELOAD_TRIGGER]", "useCompany:router.push(/company) after reconcileOnlineMirrorsWithServer");
        }
        clearCompanyId();
        router.push("/company");
      }
      if (result.changed) reloadLocalCompanyRegistry();
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.uid, user?.email, authLoading, companyId, clearCompanyId, router, reloadLocalCompanyRegistry, registryVersion]);

  useEffect(() => {
    if (!companyId) {
      setCompany(null);
      listRecoverySyncForIdRef.current = null;
      return;
    }

    const companyFromList = allCompanies.find((c) => c.id === companyId);
    plDbgCompanyRecovery("listRecovery:tick", {
      companyId,
      listLen: allCompanies.length,
      inList: Boolean(companyFromList),
      listRowMainVisible: companyFromList ? isCompanyVisibleInMainApp(companyFromList) : null,
      loading,
      ledgerShield: shouldSuppressTransientCompanyClear(),
    });
    if (companyFromList && isCompanyVisibleInMainApp(companyFromList)) {
      setCompany(companyFromList);
      listRecoverySyncForIdRef.current = null;
      return;
    }
    if (companyFromList && !isCompanyVisibleInMainApp(companyFromList)) {
      // Safety: hidden/deleted company stale list me ho to selection turant clear karo (mobile + desktop same behavior).
      // APK/static: voucher save ke baad list merge pe `isCompanyVisibleInMainApp` ek beat ke liye false ho sakta hai — shield window me clear mat karo (niche SQLite path jaisa).
      if (shouldSuppressTransientCompanyClear()) {
        plDbgCompanyRecovery("listRecovery:listRowNotMainVisible:deferPulse", { companyId });
        setTimeout(() => setLoadingPulse((p) => p + 1), 400);
        return;
      }
      plDbgCompanyRecovery("listRecovery:listRowNotMainVisible:clear", { companyId });
      setCompany(null);
      listRecoverySyncForIdRef.current = null;
      clearCompanyId();
      return;
    }

    // Pehle `allCompanies.length === 0` guard tha — SQLite recovery kabhi fire nahi hoti thi jab list empty/loading.
    // List settle: `loading` ref se (deps me `loading` nahi — HMR stable); `loadingPulse` se false transition par re-run.
    if (loading) return;

    // Online shared: khali list par bhi grace (sidebar nav)
    let graceMs = allCompanies.length === 0 ? 0 : 2000;
    if (user?.uid && !isLocalOnlyMode()) {
      graceMs = allCompanies.length === 0 ? LIST_RECOVERY_ONLINE_EMPTY_GRACE_MS : LIST_RECOVERY_ONLINE_NONEMPTY_GRACE_MS;
    }
    if (Date.now() - mountedAtRef.current < graceMs) return;

    let cancelled = false;
    void (async () => {
      // Approve/outbox / heavy writes: SQLite "busy" throw kar sakta hai — pehle wala catch+clear galat /company redirect karta tha APK par.
      let localRow: Awaited<ReturnType<typeof getLocalCompanyById>> | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        if (cancelled) return;
        try {
          if (attempt > 0) await new Promise((r) => setTimeout(r, 120 * attempt));
          localRow = await getLocalCompanyById(companyId);
          break;
        } catch {
          localRow = null;
          if (attempt === 2) {
            plDbgCompanyRecovery("listRecovery:getLocalBusy:skipClear", { companyId });
            console.warn(
              "[useCompany] getLocalCompanyById failed after retries (likely DB busy); skip clearCompanyId to avoid wrong /company redirect."
            );
            return;
          }
        }
      }
      if (cancelled) return;
      if (localRow) {
        const normalized = normalizeLocalCompany(localRow as unknown as Company);
        if (!isCompanyVisibleInMainApp(normalized)) {
          // SQLite recovery path: admin-hidden/deleted row ko list me dobara merge mat karo.
          if (shouldSuppressTransientCompanyClear()) {
            plDbgCompanyRecovery("listRecovery:sqliteNotMainVisible:deferPulse", { companyId });
            setTimeout(() => setLoadingPulse((p) => p + 1), 400);
            return;
          }
          plDbgCompanyRecovery("listRecovery:sqliteNotMainVisible:clear", { companyId });
          setCompany(null);
          listRecoverySyncForIdRef.current = null;
          clearCompanyId();
          return;
        }
        plDbgCompanyRecovery("listRecovery:sqliteMergeIntoList", { companyId });
        setCompany(normalized);
        setAllCompanies((prev) => {
          if (prev.some((c) => c.id === companyId)) return prev;
          return [...prev, normalized];
        });
        // SQLite se row merge ho chuka — listener/ registry reload se poora UI mat hilaao.
        listRecoverySyncForIdRef.current = companyId;
        return;
      }
      // Shared user: SQLite mirror baad me — Firestore doc se recover + upsert (sidebar /company clear kam)
      if (!localRow && user?.uid && !isLocalOnlyMode()) {
        try {
          const snap = await getDoc(doc(firestore, "companies", companyId));
          if (snap.exists()) {
            const data = snap.data() || {};
            if (data.isDeleted !== true && data.movedToAdminRecycleAt == null) {
              const raw = { id: snap.id, ...data } as Company;
              const normalized = normalizeLocalCompany(raw);
              if (isCompanyVisibleInMainApp(normalized)) {
                plDbgCompanyRecovery("listRecovery:firestoreFallbackMerge", { companyId });
                setCompany(normalized);
                setAllCompanies((prev) => {
                  if (prev.some((c) => c.id === companyId)) return prev;
                  return [...prev, normalized];
                });
                listRecoverySyncForIdRef.current = companyId;
                void upsertLocalCompany(
                  normalized as unknown as import("@/lib/localCompanyStore").LocalCompanyDoc
                ).catch(() => undefined);
                return;
              }
            }
          }
        } catch {
          plDbgCompanyRecovery("listRecovery:firestoreFallbackDeniedOrErr", { companyId });
        }
      }
      console.log("Company not found in user's list, clearing local state.");
      if (shouldSuppressTransientCompanyClear()) {
        plDbgCompanyRecovery("listRecovery:notInSqlite:deferPulse", { companyId });
        setTimeout(() => setLoadingPulse((p) => p + 1), 450);
        return;
      }
      plDbgCompanyRecovery("listRecovery:notInSqlite:clear", { companyId });
      clearCompanyId();
    })();

    return () => {
      cancelled = true;
    };
  }, [companyId, allCompanies, loadingPulse, clearCompanyId, normalizeLocalCompany, user?.uid]);

  useEffect(() => {
    if (companyId) return;
    if (loading || authLoading) return;
    if (!user) return;
    if (!allCompanies || allCompanies.length === 0) return;
    const livePath = normalizeAppPath(getBrowserPathname());
    if (pathExemptFromAutoSelectCompanyPush(livePath)) return;
    // Fallback auto-select: companyId race me missing rahe to tab-click ka wait na ho.
    setCompanyId(allCompanies[0].id);
    plNavDbg("useCompany.autoSelectFirstCompany (companyId was null)", {
      firstHint: plNavDbgIdHint(allCompanies[0].id),
      listLen: allCompanies.length,
    });
  }, [companyId, allCompanies, setCompanyId, user, loading, authLoading]);

  useEffect(() => {
    if (authLoading) return;
    // Wait for initial localStorage read before any redirect (static/Capacitor race)
    if (!hasCheckedStorageRef.current) return;

    const pathTrim = normalizeAppPath(pathname ?? "");
    const winPath = normalizeAppPath(getBrowserPathname());

    // pathname stale + companyId brief null → timer le /company (static build Settings)
    if (shouldSkipMissingCompanyRedirect(pathTrim, winPath)) {
        return;
    }

    // Firestore companies list abhi load: companyId baad me list se / localStorage se set ho sakta — /company jaldi mat kholo.
    if (user && loading && !companyId) {
      return;
    }

    if (!companyId && user) {
        queueMicrotask(() => {
          // Fast SQLite/local writes: persisted company id turant hai, React `companyId` ek frame baad hydrate — stale null avoid
          try {
            if (companyIdLiveRef.current) return;
            const redo = readSelectedCompanyId()?.trim();
            if (redo) {
              setCompanyIdState(redo);
              plNavDbg("useCompany.persistedHydrate.microtask", { hint: plNavDbgIdHint(redo) });
            }
          } catch {
            /* ignore */
          }
        });

        try {
            // Refresh recovery must use per-tab company first, otherwise another tab's last selection wins.
            const storedCompanyId = readSelectedCompanyId();
            const stored = storedCompanyId?.trim();
            if (!stored) {
                // Static/Capacitor: IndexedDB + Firestore slow — localStorage/sync ke liye zyada grace
                const REDIRECT_DELAY_MS = 1400;
                plNavDbg("useCompany.scheduleMissingCompanyRedirect", {
                  pathname: winPath,
                  delayMs: REDIRECT_DELAY_MS,
                  shieldActive: shouldSuppressTransientCompanyClear(),
                });
                const id = setTimeout(() => {
                    const again = readSelectedCompanyId();
                    if (again) {
                        plNavDbg("useCompany.redirectTimer:storedReappeared", { hint: plNavDbgIdHint(again) });
                        setCompanyIdState(again);
                        return;
                    }
                    const live = normalizeAppPath(getBrowserPathname());
                    if (shouldSkipMissingCompanyRedirect(live, live)) return;
                    // Persisted-pin delay vs React hydrate (APK turant-SQLite path)
                    if (shouldDeferMissingCompanyRedirectNative(companyIdLiveRef.current)) {
                      plDbgCompanyRecovery("redirectNoStoredCompany:nativeHydrationDeferHold", {});
                      plNavDbg("useCompany.router.push./company TIMER BLOCKED hydrationDefer", { live });
                      return;
                    }
                    // APK save / ledger shield: storage flush + ~26s race me `/company` mat kholo.
                    if (shouldSuppressTransientCompanyClear()) {
                      plDbgCompanyRecovery("redirectNoStoredCompany:shieldHold", {});
                      plNavDbg("useCompany.router.push./company TIMER BLOCKED shield", { live });
                      return;
                    }
                    plDbgCompanyRecovery("redirectNoStoredCompany:push.company", { live });
                    plNavDbgCritical("useCompany.router.push./company [missingCompanyId delayed]", {
                      live,
                      delayMs: REDIRECT_DELAY_MS,
                    });
                    router.push("/company");
                }, REDIRECT_DELAY_MS);
                return () => clearTimeout(id);
            } else {
                setCompanyIdState(stored);
            }
        } catch (_) {
            const live = normalizeAppPath(getBrowserPathname());
            if (!shouldSkipMissingCompanyRedirect(pathTrim, live)) {
                // Fast local hydrate: React null, storage me id — transient push mat karo
                if (shouldDeferMissingCompanyRedirectNative(companyId)) {
                  plDbgCompanyRecovery("redirectNoStoredCompany:catch:nativeHydrationDefer", {});
                  return;
                }
                // Fallback catch path me bhi guard respect karo taaki transient read-error se save ke turant baad `/company` na khule.
                if (shouldSuppressTransientCompanyClear()) {
                  plDbgCompanyRecovery("redirectNoStoredCompany:catch:shieldHold", {});
                  return;
                }
                plNavDbgCritical("useCompany.router.push./company [missingCompany catch path]", { live });
                router.push("/company");
            }
        }
    }
  }, [companyId, pathname, router, user, authLoading, loading]);

  /** SuperAdmin: /admin vs main app — list sirf filter se update; Firestore/SQLite route pe dubara nahi. */
  useEffect(() => {
    if (!user) return;
    const raw = isLocalOnlyMode()
      ? latestLocalNormalizedCompaniesRef.current
      : latestOnlineMergedUnfilteredRef.current;
    if (raw.length === 0) return;
    setAllCompanies(
      filterSharedOnlyCompaniesForSuperAdminInMainApp(raw, user, isSuperAdminUser, pathname)
    );
  }, [pathname, user, isSuperAdminUser]);

  const companyWithLocalFiscal = useMemo(
    () => mergeCompanyWithLocalFiscal(company, companyId),
    [company, companyId, fiscalLocalEpoch]
  );

  return (
    <CompanyContext.Provider
      value={{
        companyId,
        company: companyWithLocalFiscal,
        loading,
        triggerSync,
        reloadLocalCompanyRegistry,
        localCompanyRegistryEpoch: localRegistryEpoch,
        setCompanyId,
        clearCompanyId,
        allCompanies,
        planAuthoritativeSync,
        refreshAuthoritativePlan: () => refreshAuthoritativePlan(),
        effectiveNotificationSettings,
      }}
    >
      {children}
    </CompanyContext.Provider>
  );
};

export const useCompany = () => {
  const context = useContext(CompanyContext);
  if (context === undefined) {
    throw new Error("useCompany must be used within a CompanyProvider");
  }
  return context;
};
