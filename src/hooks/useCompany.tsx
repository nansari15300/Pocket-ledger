
"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef, useMemo } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "./useAuth";
import { onSnapshot, collection, query, where, Timestamp, getDocs } from "firebase/firestore";
import { auth, firestore } from "@/lib/firebase";
import type { PermissionConfig } from "./usePermissions";
import { isLocalOnlyMode } from "@/lib/localMode";
import { getLocalCompanyById, listLocalCompanies, upsertLocalCompany } from "@/lib/localCompanyStore";
import type { PlanId } from "@/config/plans";
import { useLivePlans, getPlanFromPlans } from "@/hooks/useLivePlans";
import type { CompanyDemoteReason } from "@/lib/companyDemote";
import { reconcileOnlineMirrorsWithServer } from "@/lib/companyOnlineIntegrity";
import { BUMP_LOCAL_COMPANY_REGISTRY_EVENT } from "@/lib/applyStripePlanToLocalCompany";
import { readCompanyPlanLocalCache } from "@/lib/companyPlanLocalCache";
import {
  syncCompanyPlanFromServer,
  recomputePlanSyncBannerState,
  type PlanSyncBannerState,
} from "@/lib/companyPlanServerSync";
import {
  getEffectiveNotificationSettings,
  NOTIFICATION_PREFS_CHANGED_EVENT,
} from "@/lib/localUserNotificationSettings";
import { getLocalFiscalSplitOrDefaults, LOCAL_FISCAL_SPLIT_CHANGED_EVENT } from "@/lib/localFiscalSplitStore";


export type DisplaySettings = {
    showDebit?: boolean;
    showCredit?: boolean;
    showBalance?: boolean;
    showTotalDebit?: boolean;
    showTotalCredit?: boolean;
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
    displaySettings?: DisplaySettings;
    isApprovalEnabled?: boolean;
    isOwned?: boolean;
    planId?: string;
    planExpiry?: Timestamp;
    /** Set when a paid plan is applied (Stripe fulfill); good proxy for “joined” paid subscription date. */
    planUpgradedAt?: Timestamp;
    settings?: Record<string, boolean>;
    allowAttachments?: boolean;
    isDeleted?: boolean; 
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
  const isLocalFirst =
    raw?.storageOption === "local" ||
    raw?.syncPolicy === "offline" ||
    raw?.syncedFromCloud !== true;
  const le = planExpiryMsFromCompanyShape(localNorm);
  const oe = planExpiryMsFromCompanyShape(online);
  const lp = String(localNorm.planId || "basic").trim();
  const op = String(online.planId || "basic").trim();
  const localPaid = lp !== "basic";
  const onlineBasic = op === "basic";
  let useLocal = false;
  if (isLocalFirst) useLocal = true;
  else if (localPaid && onlineBasic) useLocal = true;
  else if (le != null && oe != null && le > oe) useLocal = true;
  else if (le != null && oe == null) useLocal = true;

  if (!useLocal) return online;

  const mergedPlan = {
    ...online,
    planId: lp,
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
  setCompanyId: (companyId: string) => void;
  clearCompanyId: () => void;
  /** Server → local sync UX: 3d stale, 20d “go online”, offline license expiry */
  planAuthoritativeSync: PlanSyncBannerState;
  /** LocalStorage + current user: badges/sidebar — Firestore company row sirf fallback (unsynced company bhi). */
  effectiveNotificationSettings: NotificationSettings;
};

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

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
  const { user, customUser, loading: authLoading } = useAuth();
  const ownedSnapRef = useRef<any>(null);
  const sharedSnapRef = useRef<any>(null);
  const ownedByEmailSnapRef = useRef<any>(null);
  const isSuperAdmin = customUser?.role === "SuperAdmin";
  /** Local + online dono: `app_settings/plans` merged entitlements (sirf static config/plans nahi). */
  const livePlans = useLivePlans();
  // Har plans-snapshot par naya object → `normalizeLocalCompany` unstable tha → deps wale effects (local registry + Firestore list) bar-bar → useVouchers listeners reset = "auto refresh" feel.
  const livePlansRef = useRef(livePlans);
  livePlansRef.current = livePlans;

  const triggerSync = useCallback(() => {
    setRegistryVersion((v) => v + 1);
  }, []);
  const reloadLocalCompanyRegistry = useCallback(() => {
    setLocalRegistryEpoch((v) => v + 1);
  }, []);

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
      const storedCompanyId = localStorage.getItem("companyId");
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
    localStorage.removeItem("companyId");
    setCompanyIdState(null);
    setCompany(null);
    setAllCompanies([]);
  }, []);

  const setCompanyId = useCallback((newCompanyId: string) => {
    localStorage.setItem("companyId", newCompanyId);
    setCompanyIdState(newCompanyId);
  }, []);

  const normalizeLocalCompany = useCallback((raw: Company): Company => {
    // Local-first: planId + Firestore live plans (admin entitlements) — static DEFAULT_PLANS se align karo.
    let planId = (raw.planId && String(raw.planId).trim()) || "basic";
    let rawMs = (raw as unknown as { planExpiryMs?: unknown }).planExpiryMs;
    const sqliteMs = typeof rawMs === "number" && Number.isFinite(rawMs) ? rawMs : null;
    // localStorage plan cache: server sync / Stripe ke baad mirror ne Basic likh diya ho to bhi limits sahi
    let stripeSessionFromPlanCache: string | undefined;
    const cached = readCompanyPlanLocalCache(String(raw.id || ""));
    if (cached) {
      const cp = String(cached.planId || "").trim() || "basic";
      const sqliteBasic = planId === "basic";
      const cachePaid = cp !== "basic";
      const expBetter = sqliteMs == null || cached.planExpiryMs > sqliteMs;
      if (cachePaid && (sqliteBasic || expBetter)) {
        planId = cp;
        rawMs = cached.planExpiryMs;
        stripeSessionFromPlanCache = cached.lastStripeCheckoutSessionId;
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

  /** Login + selected company: server → local plan + offline license; `normalizeLocalCompany` ke baad hook order safe. */
  const planSyncBurstRef = useRef(0);
  useEffect(() => {
    if (!user || !companyId || authLoading) return;

    let cancelled = false;

    const finish = async (r: Awaited<ReturnType<typeof syncCompanyPlanFromServer>>) => {
      if (cancelled) return;
      const row = await getLocalCompanyById(companyId);
      // Plan apply: banner + current company row — poori registry reload ki zaroorat nahi (scroll/UI skip).
      if (row && r.ok && r.applied) {
        const norm = normalizeLocalCompany(row as unknown as Company);
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
        recomputePlanSyncBannerState(companyId, row as { offlineLicenseValidUntilMs?: number } | null)
      );
    };

    const runSyncNow = () => {
      if (cancelled) return;
      void (async () => {
        const row = await getLocalCompanyById(companyId);
        const firebaseCompanyId =
          String(row?.authoritativeCompanyId || companyId).trim() || companyId;
        const r = await syncCompanyPlanFromServer({
          firebaseCompanyId,
          localCompanyId: companyId,
          getIdToken: () => user.getIdToken(),
        });
        await finish(r);
      })();
    };

    planSyncBurstRef.current = 0;
    runSyncNow();

    // Periodic plan API band: pehle har ~7 min `companyPlanServerSync` — ab sirf mount + tab visible + online par.

    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - planSyncBurstRef.current < 45_000) return;
      planSyncBurstRef.current = now;
      runSyncNow();
    };

    const onOnline = () => {
      planSyncBurstRef.current = 0;
      runSyncNow();
    };

    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("online", onOnline);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("online", onOnline);
    };
  }, [user, companyId, authLoading, normalizeLocalCompany]);

  // Local-only APK/static: SQLite + optional one-shot cloud mirror; `localRegistryEpoch` = demote/Stripe bump — `registryVersion` nahi (har save UI refresh band).
  useEffect(() => {
    if (!isLocalOnlyMode()) return;
    let cancelled = false;
    (async () => {
      // Local-first + online login: cloud companies ko local store me mirror karo so dropdown/data local se chale.
      if (user?.uid && user?.email) {
        try {
          const ownedSnap = await getDocs(query(collection(firestore, "companies"), where("ownerId", "==", user.uid)));
          const sharedSnap = await getDocs(query(collection(firestore, "companies"), where("sharedWithEmails", "array-contains", user.email)));
          const cloudRows = [...ownedSnap.docs, ...sharedSnap.docs]
            .map((d: any) => ({ id: d.id, ...(d.data() || {}) }))
            .filter((c: any) => c?.isDeleted !== true);
          for (const row of cloudRows) {
            const raw = row as Record<string, unknown>;
            const rid = String(raw.id ?? "");
            if (!rid) continue;
            const existing = await getLocalCompanyById(rid, { includeDeleted: true });
            const localMs =
              typeof (existing as unknown as { updatedAt?: unknown })?.updatedAt === "number"
                ? (existing as unknown as { updatedAt: number }).updatedAt
                : 0;
            const cloudMs = companyDocUpdatedAtMs(raw);
            // Pure local / restore row — cloud mirror se kabhi mat overwrite (refresh ke baad data gayab ho jata tha)
            if (existing && String((existing as { storageOption?: string }).storageOption || "").toLowerCase() === "local") {
              continue;
            }
            // Edit Company local save ke turant baad `reloadLocalCompanyRegistry` → yeh loop dubara chalta hai; Firestore abhi purana naam rakhta hai to SQLite stomp na ho (rename "save" UI revert).
            if (existing && localMs > cloudMs) continue;
            await upsertLocalCompany({
              ...row,
              storageOption: "firebase",
              syncPolicy: "online",
              syncedFromCloud: true,
            } as any);
          }
        } catch {
          /* cloud mirror optional */
        }
      }
      const localCompanies = await listLocalCompanies();
      if (cancelled) return;
      const normalizedLocalCompanies = localCompanies.map((c) => normalizeLocalCompany(c as unknown as Company));
      await Promise.all(normalizedLocalCompanies.map((c) => upsertLocalCompany(c as any)));
      setAllCompanies(normalizedLocalCompanies);
      if (!companyId) {
        setCompany(null);
        setLoading(false);
        return;
      }
      const selected = await getLocalCompanyById(companyId);
      if (cancelled) return;
      setCompany(selected ? normalizeLocalCompany(selected as unknown as Company) : null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, companyId, normalizeLocalCompany, localRegistryEpoch]);

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
    const owned = ownedSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data(), isOwned: true } as Company)).filter((c: Company) => !c.isDeleted);
    const shared = sharedSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data(), isOwned: false } as Company)).filter((c: Company) => !c.isDeleted);
    const ownedByEmail = ownedByEmailSnap?.docs?.map((doc: any) => ({ id: doc.id, ...doc.data(), isOwned: true } as Company)).filter((c: Company) => !c.isDeleted) ?? [];

    /** Firestore doc abhi bhi query me hai lekin `isDeleted: true` — SQLite mirror purana ho to merge se dubara list me mat lao */
    const deletedOnFirestore = new Set<string>();
    for (const snap of [ownedSnap, sharedSnap, ownedByEmailSnap]) {
      snap?.docs?.forEach((doc: { id: string; data: () => Record<string, unknown> }) => {
        if (doc.data()?.isDeleted === true) deletedOnFirestore.add(doc.id);
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
    (localCompanies || []).forEach((c: Company) => {
      if (deletedOnFirestore.has(c.id)) return;
      const normalized = normalizeLocalCompany(c);
      const existing = companyMap.get(c.id);
      if (!existing) {
        companyMap.set(c.id, normalized);
      } else {
        companyMap.set(c.id, mergeOnlineCompanyWithLocalPlanOverlay(existing as Company, normalized));
      }
    });

    const mergedCompanies = Array.from(companyMap.values());
    // Sync engine: persist all online-category companies to local DB on every server snapshot update.
    await Promise.all(
      mergedCompanies
        .filter((c) => ((c.storageOption || "firebase") as string).toLowerCase() !== "local")
        .map((c) =>
          upsertLocalCompany({
            ...(c as any),
            storageOption: "firebase",
            syncPolicy: "online",
            syncedFromCloud: true,
          } as any)
        )
    );
    setAllCompanies(mergedCompanies);
    setLoading(false);
  }, [user?.uid, user?.email, normalizeLocalCompany]);

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
            .filter((c: any) => !c?.isDeleted)
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

    const ownedByEmailQuery = isSuperAdmin && user?.email
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
        clearCompanyId();
        router.push("/company");
      }
      if (result.changed) reloadLocalCompanyRegistry();
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.uid, user?.email, authLoading, companyId, clearCompanyId, router, reloadLocalCompanyRegistry]);

  useEffect(() => {
    if (!companyId) {
      setCompany(null);
      listRecoverySyncForIdRef.current = null;
      return;
    }

    const companyFromList = allCompanies.find((c) => c.id === companyId);
    if (companyFromList) {
      setCompany(companyFromList);
      listRecoverySyncForIdRef.current = null;
      return;
    }

    // Pehle `allCompanies.length === 0` guard tha — SQLite recovery kabhi fire nahi hoti thi jab list empty/loading.
    // List settle: `loading` ref se (deps me `loading` nahi — HMR stable); `loadingPulse` se false transition par re-run.
    if (loading) return;

    // Firestore list ke saath race: non-empty list ke liye 2s grace; khali list + loading false = turant SQLite try.
    const graceMs = allCompanies.length === 0 ? 0 : 2000;
    if (Date.now() - mountedAtRef.current < graceMs) return;

    let cancelled = false;
    void (async () => {
      try {
        // Race: allCompanies abhi update nahi hua lekin SQLite me company hai — seedha clear mat karo.
        const localRow = await getLocalCompanyById(companyId);
        if (cancelled) return;
        if (localRow) {
          const normalized = normalizeLocalCompany(localRow as unknown as Company);
          setCompany(normalized);
          // Dropdown / selector `allCompanies` se aata hai — row list me merge karo taaki local company "gayab" na lage.
          setAllCompanies((prev) => {
            if (prev.some((c) => c.id === companyId)) return prev;
            return [...prev, normalized];
          });
          // SQLite se row merge ho chuka — listener/ registry reload se poora UI mat hilaao.
          listRecoverySyncForIdRef.current = companyId;
          return;
        }
      } catch {
        /* ignore */
      }
      if (cancelled) return;
      console.log("Company not found in user's list, clearing local state.");
      clearCompanyId();
    })();

    return () => {
      cancelled = true;
    };
  }, [companyId, allCompanies, loadingPulse, clearCompanyId, normalizeLocalCompany]);

  useEffect(() => {
    if (!isLocalOnlyMode()) return;
    if (companyId) return;
    if (!allCompanies || allCompanies.length === 0) return;
    // Local-only mode: selected company missing ho to first local company auto-select karo.
    setCompanyId(allCompanies[0].id);
  }, [companyId, allCompanies, setCompanyId]);

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
        try {
            const storedCompanyId = localStorage.getItem("companyId");
            const stored = storedCompanyId?.trim();
            if (!stored) {
                // Static/Capacitor: IndexedDB + Firestore slow — localStorage/sync ke liye zyada grace
                const REDIRECT_DELAY_MS = 1400;
                const id = setTimeout(() => {
                    const again = localStorage.getItem("companyId")?.trim();
                    if (again) {
                        setCompanyIdState(again);
                        return;
                    }
                    const live = normalizeAppPath(getBrowserPathname());
                    if (shouldSkipMissingCompanyRedirect(live, live)) return;
                    router.push("/company");
                }, REDIRECT_DELAY_MS);
                return () => clearTimeout(id);
            } else {
                setCompanyIdState(stored);
            }
        } catch (_) {
            const live = normalizeAppPath(getBrowserPathname());
            if (!shouldSkipMissingCompanyRedirect(pathTrim, live)) {
                router.push("/company");
            }
        }
    }
  }, [companyId, pathname, router, user, authLoading, loading]);

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
        setCompanyId,
        clearCompanyId,
        allCompanies,
        planAuthoritativeSync,
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
