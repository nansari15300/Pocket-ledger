
"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo, useRef, useCallback } from "react";
import { usePathname } from "next/navigation";
// Full collection queries: web cloud bhi pura voucher list (no orderBy/limit window).
import { collectionGroup, query, where, onSnapshot, collection, getDoc, getDocs, getDocFromServer, doc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { useCompany } from "./useCompany";
import { useAuth } from "./useAuth";
import usePermissions from "./usePermissions";
import type { Party, Group } from "@/components/party/types";
import type { Staff, StaffGroup } from "@/components/staff/types";
import type { Account, AccountGroup } from "@/components/bank-cash/types";
import type { Tax, TaxGroup } from "@/components/tax/types";
import type { ExpenseAccount, ExpenseGroup } from "@/components/expenses/types";
import type { Item, ItemGroup } from "@/components/items/types";
import { errorEmitter } from "@/firebase/error-emitter";
import { FirestorePermissionError } from "@/firebase/errors";
import { isLocalOnlyMode } from "@/lib/localMode";
import { isStaticAppBuild } from "@/lib/isStaticAppBuild";
import { isStaticApkLedgerTransportMode } from "@/lib/staticApkLedgerArchitecture";
import {
  BROWSER_DB_COLLECTION_BUMP,
  listCompanyDocsFromBrowserDb,
  listVoucherSummaryProjectionFromBrowserDb,
  mirrorCollectionDocsToBrowserDbSilent,
  type BrowserDbCollectionBumpDetail,
} from "@/lib/localCompanyDocMirror";
import { getLocalAuthToken, getLocalAuthUser, LOCAL_AUTH_CHANGED_EVENT } from "@/lib/localApiClient";
import {
  mergeRemoteSnapshotWithLocalOnlyDocs,
  pullCompanySubcollectionFromFirestoreToLocalDb,
} from "@/lib/firestoreToLocalCompanyPull";
import { getLocalCompanyById } from "@/lib/localCompanyStore";
import { decryptFirestoreCompanyDocIfNeeded } from "@/lib/serverBackupEncryption";
import { stripLocalMirrorMetaForUiRow } from "@/lib/localMirrorServerMeta";
import { parseLocalCompanyUserRows } from "@/lib/localCompanyUsers";
import { getAllocatedByVoucherId, getAllocatedByVoucherIdFromPaymentOuts, getAllocatedByVoucherIdFromPurchase, getAllocatedByVoucherIdFromSale, getAllocatedByVoucherIdFromJournal, getOutgoingAllocatedToOpposite, getPaymentStatus as getPaymentStatusResult } from "@/lib/payment-allocation-utils";
import { shouldSuppressTransientCompanyClear } from "@/lib/apkLedgerRouteShield";
import { resolveInterCompanyLegsForVoucher } from "@/lib/interCompany/interCompanyPostingLegs";
import {
  interCompanyVoucherViewerSide,
  isInterCompanyVisibleOnTargetBank,
} from "@/lib/interCompany/interCompanyVoucherHydrate";
import { isRecurringAutoUserDisplayLabel } from "@/lib/interCompany/interCompanyVoucherHistory";
import { backfillInterCompanySourceApprovedFlags } from "@/lib/interCompany/interCompanyVisibilityBackfill";

/** Offline company: vouchers me `userId` aksar owner ka Firebase uid ya `local` — sirf `user.uid` match se shared user ko 0 rows. */
function localCompanyRoleAllowsViewAll(role: string | undefined): boolean {
  const r = String(role || "")
    .toLowerCase()
    .trim()
    .replace(/_/g, "-")
    .replace(/\s+/g, "-");
  return ["manager", "editor", "accountant", "owner"].includes(r);
}

// --- Report-only party IDs: show only in reports, never in voucher/entity dropdowns or lists ---
export const REPORT_ONLY_PARTY_IDS = ["owners_capital", "opening_balance_ledger"] as const;
// --- System accounts hidden from party/account dropdowns in vouchers (Sale, Purchase, etc.) ---
const PARTY_SELECTION_HIDDEN_IDS = ["sales_account", "purchase_account"] as const;

// --- Types ---
type ProcessedParty = Party & { debit: number; credit: number; balance: number; isSystemAccount?: boolean };
export type ProcessedStaff = Staff & { debit: number; credit: number; balance: number };
export type ProcessedAccount = Account & { debit: number; credit: number; balance: number };
type ProcessedTax = Tax & { debit: number; credit: number; balance: number };
type ProcessedItem = Item & { stockInQty?: number, stockOutQty?: number, stockQty?: number; displayStockQty?: number; };
type ProcessedItemGroup = ItemGroup & { debit: number; credit: number; balance: number; };
type ProcessedGroup = Group & { debit: number; credit: number; balance: number; };
type ProcessedAccountGroup = AccountGroup & { debit: number; credit: number; balance: number; };
export type ProcessedStaffGroup = StaffGroup & { debit: number; credit: number; balance: number; };
type ProcessedTaxGroup = TaxGroup & { debit: number; credit: number; balance: number; };
type ProcessedExpenseAccount = ExpenseAccount & { debit: number; credit: number; balance: number; };
type ProcessedExpenseGroup = ExpenseGroup & { debit: number; credit: number; balance: number; };

type VoucherContextType = {
  vouchers: any[];
  /** Unfiltered vouchers for allocation computation when view filter would undercount Other Linked. */
  vouchersAll: any[];
  loading: boolean;
  processedParties: ProcessedParty[];
  /** Parties for dropdowns/lists only; excludes Opening Balance & Owner's Capital (report-only). */
  processedPartiesForSelection: ProcessedParty[];
  processedStaff: ProcessedStaff[];
  processedAccounts: ProcessedAccount[];
  processedTaxes: ProcessedTax[];
  expenseAccounts: ExpenseAccount[];
  processedItems: ProcessedItem[];
  processedItemGroups: ProcessedItemGroup[];
  processedGroups: ProcessedGroup[];
  processedAccountGroups: ProcessedAccountGroup[];
  processedStaffGroups: ProcessedStaffGroup[];
  processedTaxGroups: ProcessedTaxGroup[];
  processedExpenseAccounts: ProcessedExpenseAccount[];
  processedExpenseGroups: ProcessedExpenseGroup[];
  journalAccountNames: Record<string, string>;
  userNames: Record<string, string>;
  /** Overdue sale/purchase transactions across all parties (for "Overdue Vouchers" view). */
  overdueTransactions: Array<{ id: string; type: string; date: any; voucherNumber: string; partyId: string; partyName: string; total: number; outstanding: number; debit: number; credit: number; dueDate?: any; isOverdue: boolean; paymentStatus: string; overdueImportant?: boolean; userId?: string; userName?: string; narration?: string; createdAt?: any; lastEditedAt?: any; updatedAt?: any }>;
  hasOverdueTransactions: boolean;
};

/** Browser SQLite se aaye vouchers ko Firestore jaisa `date` order mein lao. */
function sortDocsByDateField(data: any[], orderByField: string): any[] {
  const copy = [...data];
  copy.sort((a: any, b: any) => {
    const dateA = a[orderByField]?.toDate ? a[orderByField].toDate() : new Date(a[orderByField]);
    const dateB = b[orderByField]?.toDate ? b[orderByField].toDate() : new Date(b[orderByField]);
    return dateA.getTime() - dateB.getTime();
  });
  return copy;
}

/** React/forms me SQLite-only mirror META leak na ho — runtime list state sirf strip. */
function stripMirrorMetaForEntityListRow(row: any): any {
  if (!row || typeof row !== "object") return row;
  return stripLocalMirrorMetaForUiRow(row as Record<string, unknown>);
}

/** SQLite bootstrap / prefetch: Firestore-merge jaisi strip taaki META forms me na jaye. */
function sqliteCachedRowsForSetter(cached: any[], orderByField?: string): any[] {
  const base = orderByField ? sortDocsByDateField(cached, orderByField) : cached;
  return base.map(stripMirrorMetaForEntityListRow);
}

/** Firestore `where('…','in', …)` discrete values cap — pura `users` scan ki jagah chunk queries. */
const FIRESTORE_UID_IN_CHUNK = 30;

/**
 * Ledger masters already hook state me ho to voucher-linked ids ko direct map se naam do;
 * sequential `getDoc` per voucher id (400+ rows) Chrome hang / "Page Unresponsive" trigger karta tha — plan limits se unrelated.
 */
function buildJournalLinkedEntityNameLookup(
  parties: Party[],
  staff: Staff[],
  accounts: Account[],
  taxes: Tax[],
  expenseAccounts: ExpenseAccount[],
  items: Item[]
): Map<string, string> {
  const m = new Map<string, string>();
  const put = (id: unknown, nm: unknown) => {
    if (id == null || id === "") return;
    const name = typeof nm === "string" ? nm.trim() : "";
    if (!name || name === "Unknown" || name === "N/A") return;
    m.set(String(id), name);
  };
  parties.forEach((p) => put(p?.id, p?.name));
  staff.forEach((s) => put(s?.id, s?.name));
  accounts.forEach((a) => put(a?.id, (a as Account)?.accountName));
  taxes.forEach((t) => put(t?.id, t?.name));
  expenseAccounts.forEach((e) => put(e?.id, e?.name));
  items.forEach((it) => put(it?.id, it?.name));
  return m;
}

/** User doc snapshot → voucher “User column” text; email prefix heuristic raw-uid avoidance. */
function displayNameFromUserFirestoreDoc(data: Record<string, unknown> | undefined, docId: string): string | null {
  if (!data) return null;
  const uid = (data.uid as string) || docId;
  if (!uid) return null;
  const email = typeof data.email === "string" ? data.email : "";
  const emailPrefix = email.includes("@") ? email.split("@")[0] : "";
  const raw = (data.displayName || data.name || emailPrefix || null) as string | null;
  if (!raw || raw === "Unknown" || raw === "N/A") return null;
  const isUIDPattern =
    raw.length > 15 && /^[a-zA-Z0-9_-]+$/.test(raw) && !raw.includes("@") && !raw.includes(" ");
  const name = isUIDPattern && emailPrefix ? emailPrefix : raw;
  return name || null;
}

/**
 * Bulk uid → display name WITHOUT `getDocs(collection(users))` (poor scalability + freezes UI on company load).
 */
async function batchFetchUserDisplayNamesFromFirestore(uidList: string[], shouldAbort: () => boolean): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const uniq = [...new Set(uidList.map((u) => String(u || "").trim()).filter(Boolean))];
  if (!uniq.length) return out;
  for (let i = 0; i < uniq.length; i += FIRESTORE_UID_IN_CHUNK) {
    if (shouldAbort()) return out;
    const chunk = uniq.slice(i, i + FIRESTORE_UID_IN_CHUNK);
    try {
      const q = query(collection(firestore, "users"), where("uid", "in", chunk));
      const snap = await getDocs(q);
      snap.docs.forEach((docSnap) => {
        const nm = displayNameFromUserFirestoreDoc(docSnap.data() as Record<string, unknown>, docSnap.id);
        if (!nm) return;
        const data = docSnap.data() as { uid?: string };
        const u = typeof data.uid === "string" && data.uid.trim() ? data.uid : docSnap.id;
        if ((out[u] || "") !== nm) out[u] = nm;
      });
    } catch {
      /* rights / offline — per-uid fallback neeche */
    }
  }
  const stale = uniq.filter((u) => !out[u]);
  /** Chunked `where('uid','in',…)` baad fallback — parallel sirf UID scope (whole `users` scan nahi). */
  const USER_UID_FETCH_PARALLEL = 12;
  for (let j = 0; j < stale.length; j += USER_UID_FETCH_PARALLEL) {
    if (shouldAbort()) return out;
    const slice = stale.slice(j, j + USER_UID_FETCH_PARALLEL);
    await Promise.all(
      slice.map(async (uid) => {
        try {
          const dq = query(collection(firestore, "users"), where("uid", "==", uid));
          const ds = await getDocs(dq);
          let data = ds.docs[0]?.data() as Record<string, unknown> | undefined;
          if (!data) {
            const legacy = await getDoc(doc(firestore, "users", uid));
            if (legacy.exists()) data = legacy.data() as Record<string, unknown>;
          }
          const nm = displayNameFromUserFirestoreDoc(data, uid);
          if (nm && (out[uid] || "") !== nm) out[uid] = nm;
        } catch {
          /* skip */
        }
      })
    );
  }
  return out;
}

/**
 * Parties / … ke baad jo ids bachen — cloud mode me bounded parallel Firestore probe (sirf zaroorat par).
 */
async function resolveJournalAccountFirestoreParallel(
  companyDocId: string,
  ids: string[],
  shouldAbort: () => boolean,
  concurrency: number
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (!companyDocId || !ids.length) return out;

  async function probeOne(accountId: string): Promise<{ id: string; name: string } | null> {
    const collectionsToSearch = ["parties", "bank_accounts", "staff", "items", "expense_accounts", "taxes", "users"] as const;
    const nameFields = ["name", "accountName", "name", "name", "name", "name", "displayName"] as const;
    for (let i = 0; i < collectionsToSearch.length; i++) {
      const collectionName = collectionsToSearch[i];
      const nameField = nameFields[i];
      try {
        if (collectionName === "users") {
          const dq = query(collection(firestore, "users"), where("uid", "==", accountId));
          const snap = await getDocs(dq);
          const d = snap.docs[0]?.data() as Record<string, unknown> | undefined;
          if (d && d[nameField] != null && String(d[nameField]).trim()) {
            return { id: accountId, name: String(d[nameField]).trim() };
          }
        } else {
          const docRef = doc(firestore, `companies/${companyDocId}/${collectionName}`, accountId);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const name = docSnap.data()?.[nameField] as string | undefined;
            if (name && String(name).trim()) return { id: accountId, name: String(name).trim() };
          }
        }
      } catch {
        /* next collection */
      }
    }
    return { id: accountId, name: "Unknown Account" };
  }

  for (let k = 0; k < ids.length; k += concurrency) {
    if (shouldAbort()) return out;
    const slice = ids.slice(k, k + concurrency);
    const settled = await Promise.all(slice.map((id) => probeOne(id)));
    for (const row of settled) {
      if (row && row.name && row.name !== "Unknown Account") out[row.id] = row.name;
    }
  }
  return out;
}

/** Parties/items/… — local cache merge; optional date sort sirf vouchers ke liye. */
function mergeEntityListsById(prev: any[], cached: any[], orderByField?: string): any[] {
  if (!cached.length) return prev;
  const map = new Map<string, any>(prev.map((v: any) => [v.id, v]));
  for (const v of cached) map.set(v.id, v);
  const merged = [...map.values()];
  const sorted = orderByField ? sortDocsByDateField(merged, orderByField) : merged;
  return sorted.map(stripMirrorMetaForEntityListRow);
}

type CloudBackedCompanyShape = {
  storageOption?: string;
  syncedFromCloud?: boolean;
  syncPolicy?: string;
  authoritativeCompanyId?: string;
  encryptServerBackupSalt?: string | null;
} | null;

/** Local-first APK/static: ye flags Firestore realtime + server bootstrap enable karte hain */
function isCloudBackedCompany(c: CloudBackedCompanyShape): boolean {
  if (!c) return false;
  const so = String(c.storageOption || "").toLowerCase();
  // Explicit offline-first row — `isExplicitLocalRegistryRow` me ambiguous overlap avoid
  if (so === "local") return false;
  if (so === "firebase") return true;
  if (c.syncedFromCloud === true) return true;
  if (String(c.syncPolicy || "").toLowerCase() === "online") return true;
  if (String(c.authoritativeCompanyId || "").trim().length > 0) return true;
  return false;
}

const VoucherContext = createContext<VoucherContextType>({
  vouchers: [],
  vouchersAll: [],
  loading: true,
  processedParties: [],
  processedPartiesForSelection: [],
  processedStaff: [],
  processedAccounts: [],
  processedTaxes: [],
  expenseAccounts: [],
  processedItems: [],
  processedItemGroups: [],
  processedGroups: [],
  processedAccountGroups: [],
  processedStaffGroups: [],
  processedTaxGroups: [],
  processedExpenseAccounts: [],
  processedExpenseGroups: [],
  journalAccountNames: {},
  userNames: {},
  overdueTransactions: [],
  hasOverdueTransactions: false,
});

// Helper for generic state setters
type StateSetter<T> = React.Dispatch<React.SetStateAction<T[]>>;
/** Recycle Bin safety: isDeleted=true row app ke normal screens par kabhi na dikhe. */
const isAliveDoc = (row: any) => row?.isDeleted !== true;
const HEAVY_LEDGER_SKIP_ROUTE_PREFIXES = ["/company", "/admin", "/distributor-signup"] as const;
const HEAVY_LEDGER_SKIP_ROUTES = new Set(["/", ""]);

function shouldSkipHeavyVoucherBootstrap(pathname: string): boolean {
  const route = String(pathname || "").trim().toLowerCase();
  // Keep voucher provider idle on non-ledger routes so startup/select-company clicks stay responsive.
  if (HEAVY_LEDGER_SKIP_ROUTES.has(route)) return true;
  return HEAVY_LEDGER_SKIP_ROUTE_PREFIXES.some((prefix) => route.startsWith(prefix));
}

export const VoucherProvider = ({ children }: { children: ReactNode }) => {
  const { companyId, company, clearCompanyId } = useCompany();
  const pathname = usePathname() || "";
  const { user, customUser, loading: authLoading } = useAuth();
  const { can } = usePermissions();
  // Selected company may be local even when user is online; treat it as local-data mode.
  const isLocalCompanySelected = isLocalOnlyMode() || company?.storageOption === "local";
  /** Offline unlock same-tab: isCompanyReady / prefetch dubara (localStorage pehle listener ke baad update hota hai). */
  const [localAuthEpoch, setLocalAuthEpoch] = useState(0);
  useEffect(() => {
    const bump = () => setLocalAuthEpoch((n) => n + 1);
    window.addEventListener(LOCAL_AUTH_CHANGED_EVENT, bump);
    return () => window.removeEventListener(LOCAL_AUTH_CHANGED_EVENT, bump);
  }, []);

  const [vouchers, setVouchers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Apply View Own / View All Records: show only own vouchers when user doesn't have view_all_records
  const viewAllRecords = can("view_all_records");
  const vouchersForDisplay = useMemo(() => {
    // Defensive guard: agar stale source se deleted voucher aa bhi gaya, view layer se hata do.
    const activeVouchers = (vouchers || []).filter(isAliveDoc);
    if (!user?.uid) return [];
    const localUser =
      isLocalCompanySelected && companyId ? getLocalAuthUser(companyId) : null;
    // Local + manager/editor: permissionConfig kabhi galat ho to bhi pura ledger dikhao (voucher userId owner uid hota hai).
    const localStaffSeeAll =
      isLocalCompanySelected &&
      !!localUser &&
      localCompanyRoleAllowsViewAll(localUser.role);
    if (viewAllRecords || localStaffSeeAll) return activeVouchers;

    // Local + viewer/data-entry: apni rows — userId local id / `local` / Firebase uid
    if (isLocalCompanySelected && localUser?.id) {
      const uid = String(user.uid);
      const lid = String(localUser.id);
      const lname = (localUser.username || "").toLowerCase().trim();
      return activeVouchers.filter((v) => {
        const vid = v.userId != null ? String(v.userId) : "";
        if (vid === uid || vid === lid) return true;
        if (lname && vid.toLowerCase() === lname) return true;
        if (vid === "local" || vid === "local_guest_user") return true;
        return false;
      });
    }

    return activeVouchers.filter((v) => v.userId === user.uid);
  }, [vouchers, viewAllRecords, user?.uid, isLocalCompanySelected, companyId, localAuthEpoch]);

  // Target IC: source pehle approve ho chuka ho to `interCompanySourceApproved` backfill (bank/recent ke liye)
  const icBackfillGenRef = useRef(0);
  useEffect(() => {
    if (!companyId || !vouchersForDisplay.length) return;
    const needsBackfill = vouchersForDisplay.some(
      (v) =>
        String(v?.type || "") === "inter_company" &&
        interCompanyVoucherViewerSide(v as Record<string, unknown>) === "target" &&
        (v as Record<string, unknown>).interCompanySourceApproved !== true
    );
    if (!needsBackfill) return;
    const gen = ++icBackfillGenRef.current;
    const timer = setTimeout(() => {
      void backfillInterCompanySourceApprovedFlags(
        companyId,
        vouchersForDisplay as Array<Record<string, unknown> & { id?: string }>
      ).then(() => {
        if (gen !== icBackfillGenRef.current) return;
        /* Firestore listener vouchers refresh karega */
      });
    }, 600);
    return () => clearTimeout(timer);
  }, [companyId, vouchersForDisplay]);
  
  const [parties, setParties] = useState<Party[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [unprocessedExpenseAccounts, setUnprocessedExpenseAccounts] = useState<ExpenseAccount[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [itemGroups, setItemGroups] = useState<ItemGroup[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [accountGroups, setAccountGroups] = useState<AccountGroup[]>([]);
  const [staffGroups, setStaffGroups] = useState<StaffGroup[]>([]);
  const [taxGroups, setTaxGroups] = useState<TaxGroup[]>([]);
  const [expenseGroups, setExpenseGroups] = useState<ExpenseGroup[]>([]);
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [journalAccountNames, setJournalAccountNames] = useState<Record<string, string>>({});
  /** Stale-deps se effect storm na ho: async name fetch closure me fresh cache (plan limits unrelated hang fix). */
  const journalAccountNamesRef = useRef<Record<string, string>>({});
  journalAccountNamesRef.current = journalAccountNames;
  const userNamesRef = useRef<Record<string, string>>({});
  userNamesRef.current = userNames;
  /** Firestore snapshot → SQLite batch mirror debounce (static); unmount pe clear. */
  const mirrorSnapshotTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const lastCompanyIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (lastCompanyIdRef.current === companyId) return;
    // Company switch par purana company data turant clear karo (offline stale merge avoid).
    setVouchers([]);
    setParties([]);
    setStaff([]);
    setAccounts([]);
    setTaxes([]);
    setUnprocessedExpenseAccounts([]);
    setItems([]);
    setItemGroups([]);
    setGroups([]);
    setAccountGroups([]);
    setStaffGroups([]);
    setTaxGroups([]);
    setExpenseGroups([]);
    setJournalAccountNames({});
    setUserNames({});
    setLoading(true);
    lastCompanyIdRef.current = companyId ?? null;
  }, [companyId]);

  // Pre-fill current user name so transaction User column shows correctly (no fetch delay)
  useEffect(() => {
    if (!user?.uid) return;
    const name = customUser?.displayName || user.displayName || user.email || "You";
    setUserNames((prev) => (prev[user.uid] === name ? prev : { ...prev, [user.uid]: name }));
  }, [user?.uid, user?.displayName, user?.email, customUser?.displayName]);

  const previousData = useRef<Omit<VoucherContextType, 'loading'>>({
      vouchers: [],
      vouchersAll: [],
      processedParties: [],
      processedPartiesForSelection: [],
      processedStaff: [],
      processedAccounts: [],
      processedTaxes: [],
      expenseAccounts: [],
      processedItems: [],
      processedItemGroups: [],
      processedGroups: [],
      processedAccountGroups: [],
      processedStaffGroups: [],
      processedTaxGroups: [],
      processedExpenseAccounts: [],
      processedExpenseGroups: [],
      overdueTransactions: [],
      hasOverdueTransactions: false,
      journalAccountNames: {},
      userNames: {},
  });

  /** Har render par latest company — snapshot decrypt / pull me stale closure na ho */
  const companyRef = useRef(company);
  companyRef.current = company;

  /**
   * Pehle poora `company` object effect deps me tha — plan sync / naam / fiscal UI se reference badalta,
   * Firestore listeners teardown + 600ms delay → tab wapas aane par 4–5s blank. Sirf sync-relevant fields.
   */
  const voucherListenerCompanyKey = useMemo(() => {
    if (!company) return "";
    const c = company as CloudBackedCompanyShape;
    const shared = JSON.stringify(
      [...(company.sharedWithEmails ?? [])].map((e) => String(e).toLowerCase().trim()).sort()
    );
    return [
      company.id,
      String(c.storageOption ?? ""),
      String(c.syncPolicy ?? ""),
      c.syncedFromCloud === true ? "1" : "0",
      String(c.authoritativeCompanyId ?? "").trim(),
      String(c.encryptServerBackupSalt ?? "").trim(),
      String(company.ownerId ?? ""),
      String(company.ownerEmail ?? "").toLowerCase().trim(),
      shared,
    ].join("|");
  }, [
    company?.id,
    (company as CloudBackedCompanyShape | undefined)?.storageOption,
    (company as CloudBackedCompanyShape | undefined)?.syncPolicy,
    (company as CloudBackedCompanyShape | undefined)?.syncedFromCloud,
    (company as CloudBackedCompanyShape | undefined)?.authoritativeCompanyId,
    (company as CloudBackedCompanyShape | undefined)?.encryptServerBackupSalt,
    company?.ownerId,
    company?.ownerEmail,
    company?.sharedWithEmails,
  ]);

  // --- Data Fetching Logic ---
  useEffect(() => {
    if (authLoading) {
    setLoading(true);
      return;
    }

    const company = companyRef.current;

    const resetAllStates = () => {
      setVouchers([]); setParties([]); setStaff([]); setAccounts([]);
      setTaxes([]); setUnprocessedExpenseAccounts([]); setItems([]);
      setItemGroups([]); setGroups([]); setAccountGroups([]);
      setStaffGroups([]); setTaxGroups([]); setExpenseGroups([]);
    };

    if (shouldSkipHeavyVoucherBootstrap(pathname)) {
      // Route-level hard stop: background listeners/pulls off on selection/admin shells.
      resetAllStates();
      setLoading(false);
      return;
    }

    // सिंक पेन्डिङ भए वा कम्पनी अपूर्ण भए listener नलगाउने (permission denied रोक्न)।
    // Local/offline company: sharedWithEmails Firebase share hai — SQLite wale users ke liye valid local session kaafi.
    const shouldUseLocalCompanyData = isLocalCompanySelected;
    const emailNorm = (e: string) => String(e || "").toLowerCase().trim();
    const userEmailNorm = user?.email ? emailNorm(user.email) : "";
    const sharedEmailOk =
      !!userEmailNorm && (company?.sharedWithEmails ?? []).some((e) => emailNorm(String(e)) === userEmailNorm);
    const hasLocalUnlockedSession =
      shouldUseLocalCompanyData && !!companyId && !!getLocalAuthToken(companyId);
    const isCompanyReady =
      company?.ownerId === user?.uid ||
      !!company?.ownerEmail ||
      sharedEmailOk ||
      hasLocalUnlockedSession;
    if (!companyId || !user || !isCompanyReady) {
      resetAllStates();
      setLoading(false);
      return;
    }

    /** Subcollections Firestore par isi doc id ke neeche — authoritativeCompanyId upload/Stripe ke baad; `storageOption: local` par hamesha registry id (online backup → local restore ke baad purana cloud id mat use karo) */
    const storageOptionLocal = String((company as CloudBackedCompanyShape)?.storageOption || "").toLowerCase() === "local";
    const fsCompanyId = storageOptionLocal
      ? String(companyId || "").trim() || companyId
      : String(
          (company as CloudBackedCompanyShape)?.authoritativeCompanyId || companyId || ""
        ).trim() || companyId;

    const collectionsToPrefetch: Array<{ path: string; setter: StateSetter<any>; orderByField?: string }> = [
      { path: "vouchers", setter: setVouchers, orderByField: "date" },
      { path: "parties", setter: setParties },
      { path: "staff", setter: setStaff },
      { path: "bank_accounts", setter: setAccounts },
      { path: "taxes", setter: setTaxes },
      { path: "expense_accounts", setter: setUnprocessedExpenseAccounts },
      { path: "items", setter: setItems },
      { path: "item_groups", setter: setItemGroups },
      { path: "groups", setter: setGroups },
      { path: "account_groups", setter: setAccountGroups },
      { path: "staff_groups", setter: setStaffGroups },
      { path: "tax_groups", setter: setTaxGroups },
      { path: "expense_groups", setter: setExpenseGroups },
    ];

    // Pure offline row: Firestore try mat karo — warna getDoc fail / empty se web jaisa reset ho sakta hai
    const isExplicitLocalRegistryRow =
      shouldUseLocalCompanyData &&
      String((company as CloudBackedCompanyShape)?.storageOption || "").toLowerCase() === "local" &&
      !isCloudBackedCompany(company as CloudBackedCompanyShape);

    /** Company switch / unmount: SQLite callbacks must not write after teardown. */
    let cancelled = false;

    if (isExplicitLocalRegistryRow) {
    setLoading(true);
      // Tier-1: masters only — `vouchers` SQLite read (JSON parse) hazaar+ rows par EXE me 30–90s lagata; spinner tab tak band na ho.
      // Vouchers secondary chunk me: parties list pehle paint, totals snapshot/listeners ke baad refresh.
      const CRITICAL_SQLITE_PATHS = new Set(["parties", "groups", "bank_accounts", "expense_accounts"]);
      const loadSqliteChunk = (items: typeof collectionsToPrefetch) =>
        Promise.all(
          items.map(({ path, setter, orderByField }) =>
            (path === "vouchers"
              ? // Fast-first vouchers: projection table se lite rows pehle; full JSON parse background me.
                listVoucherSummaryProjectionFromBrowserDb(companyId, { forBackupMerge: true })
                  .then((lite) => {
                    if (cancelled || !lite.length) return;
                    setter((prev) =>
                      prev.length
                        ? prev
                        : sqliteCachedRowsForSetter(
                            lite.map((r) => ({
                              id: r.id,
                              type: r.type || "sale",
                              date: r.date || null,
                              amount: Number(r.amount || 0),
                            })),
                            orderByField
                          )
                    );
                  })
                  .catch(() => {})
                  .then(() =>
                    listCompanyDocsFromBrowserDb(companyId, path, { forBackupMerge: true })
                      .then((cached) => {
                        if (cancelled) return;
                        setter(sqliteCachedRowsForSetter(cached, orderByField));
                      })
                      .catch(() => {})
                  )
              : listCompanyDocsFromBrowserDb(companyId, path, { forBackupMerge: true })
                  .then((cached) => {
                    if (cancelled) return;
                    setter(sqliteCachedRowsForSetter(cached, orderByField));
                  })
                  .catch(() => {}))
          )
        );
      const critical = collectionsToPrefetch.filter((c) => CRITICAL_SQLITE_PATHS.has(c.path));
      const secondary = collectionsToPrefetch.filter((c) => !CRITICAL_SQLITE_PATHS.has(c.path));
      void loadSqliteChunk(critical).finally(() => {
        if (!cancelled) setLoading(false);
      });
      void loadSqliteChunk(secondary);
      return () => {
        cancelled = true;
      };
    }

    // Local APK: har online / ambiguous row ke liye pehle SQLite, phir server doc check — purane SQLite me syncedFromCloud missing ho to bhi cloud data milega
    if (shouldUseLocalCompanyData) {
    setLoading(true);
      // EXE/static: `vouchers` mirror = sabse bada table — ise critical me mat rakho warna Promise.all yahi pe minute leta hai.
      // Pehle parties/groups/staff/taxes/banks + expense_accounts; vouchers + items baaki secondary chunk (loading tab tak band).
      const CRITICAL_SQLITE_PATHS = new Set([
        "parties",
        "groups",
        "bank_accounts",
        "staff",
        "taxes",
        "expense_accounts",
      ]);
      const loadSqliteChunk = (items: typeof collectionsToPrefetch) =>
        Promise.all(
          items.map(({ path, setter, orderByField }) =>
            (path === "vouchers"
              ? // Local/APK cold load: projection rows se pehle paint; heavy voucher JSON parse baad me merge.
                listVoucherSummaryProjectionFromBrowserDb(companyId, { forBackupMerge: true })
                  .then((lite) => {
                    if (cancelled || !lite.length) return;
                    setter((prev) =>
                      prev.length
                        ? prev
                        : sqliteCachedRowsForSetter(
                            lite.map((r) => ({
                              id: r.id,
                              type: r.type || "sale",
                              date: r.date || null,
                              amount: Number(r.amount || 0),
                            })),
                            orderByField
                          )
                    );
                  })
                  .catch(() => {})
                  .then(() =>
                    listCompanyDocsFromBrowserDb(companyId, path, { forBackupMerge: true })
                      .then((cached) => {
                        if (cancelled) return;
                        setter(sqliteCachedRowsForSetter(cached, orderByField));
                      })
                      .catch(() => {})
                  )
              : listCompanyDocsFromBrowserDb(companyId, path, { forBackupMerge: true })
                  .then((cached) => {
                    if (cancelled) return;
                    setter(sqliteCachedRowsForSetter(cached, orderByField));
                  })
                  .catch(() => {}))
          )
        );
      const critical = collectionsToPrefetch.filter((c) => CRITICAL_SQLITE_PATHS.has(c.path));
      const secondary = collectionsToPrefetch.filter((c) => !CRITICAL_SQLITE_PATHS.has(c.path));
      void loadSqliteChunk(critical).finally(() => {
        // Stale-first: show local SQLite immediately; Firestore listeners refresh in background.
        if (!cancelled) setLoading(false);
      });
      void loadSqliteChunk(secondary);
    }

    // Hybrid Firestore ↔ SQLite — native/APK bundled: wifi off par bhi snapshots bind (snapshot error → SQLite merge niche).
    const unsubRef = { current: [] as (() => void)[] };

    const companyRootDocRef = doc(firestore, "companies", fsCompanyId);

    /** `firestoreRemotePullAttempt`: root server verify ke baad hi Firestore→SQLite ek baar pull; offline native par false */
    const bindHybridFirestoreToCompany = (opts: { firestoreRemotePullAttempt: boolean }) => {
      if (cancelled) return;
      // Cloud firebase company ko bhi mirror chahiye: purane guard me sirf `storageOption===local`/static — offline par SQLite khali → sirf wo screens jahan pehle online snapshot mila usable tha (PWA/APK overlap).
      const shouldSqliteHydratePullFromFirestore =
        opts.firestoreRemotePullAttempt &&
        (shouldUseLocalCompanyData || isCloudBackedCompany(companyRef.current as CloudBackedCompanyShape));

      // Initial full-collection `getDocs` parallel (chunked): sequential wait se user offline hue to adhuri mirror (# critical paths only pehle nahi poora bootstrap).
      if (shouldSqliteHydratePullFromFirestore) {
        void (async () => {
          const CONCURRENCY = 4;
          for (let i = 0; i < collectionsToPrefetch.length; i += CONCURRENCY) {
            if (cancelled) break;
            const chunk = collectionsToPrefetch.slice(i, i + CONCURRENCY);
            await Promise.all(
              chunk.map(async ({ path, setter, orderByField }) => {
                try {
                  const remoteData = await pullCompanySubcollectionFromFirestoreToLocalDb(
                    fsCompanyId,
                    companyId,
                    path,
                    companyRef.current,
                    orderByField
                  );
                  if (!remoteData.length) return;
                  if (!cancelled) setter(sqliteCachedRowsForSetter(remoteData, orderByField));
                } catch {
                  /* onSnapshot neeche incremental mirror */
                }
              })
            );
          }
        })();
      }
      if (!shouldUseLocalCompanyData && vouchers.length === 0) setLoading(true);

      const attachListeners = () => {
        if (cancelled) return;
      const collectionsToFetch: { 
        path: string; 
        setter: StateSetter<any>; 
        isGroup?: boolean; 
        orderByField?: string 
    }[] = [
      { path: 'vouchers', setter: setVouchers, isGroup: false, orderByField: 'date' },
      { path: 'parties', setter: setParties },
      { path: 'staff', setter: setStaff },
      { path: 'bank_accounts', setter: setAccounts },
      { path: 'taxes', setter: setTaxes },
      { path: 'expense_accounts', setter: setUnprocessedExpenseAccounts },
      { path: 'items', setter: setItems },
      { path: 'item_groups', setter: setItemGroups },
      { path: 'groups', setter: setGroups },
      { path: 'account_groups', setter: setAccountGroups },
      { path: 'staff_groups', setter: setStaffGroups },
      { path: 'tax_groups', setter: setTaxGroups },
      { path: 'expense_groups', setter: setExpenseGroups },
    ];

      /** Full-collection listener — web cloud par bhi poori voucher list (50-cap window hataya). */
      const collectionListenerQuery = (path: string, isGroup: boolean | undefined) => {
        if (isGroup) {
          return query(collectionGroup(firestore, path), where("companyId", "==", fsCompanyId));
        }
        return query(collection(firestore, `companies/${fsCompanyId}/${path}`));
      };

      const unsubscribers = collectionsToFetch.map(({ path, setter, isGroup, orderByField }) => {
        const q = collectionListenerQuery(path, isGroup);
        return onSnapshot(q, (snapshot) => {
          if (cancelled) return;
          const co = companyRef.current;
          const cryptoCtx = co ? { encryptServerBackupSalt: co.encryptServerBackupSalt } : null;
          void (async () => {
            const data = (
              await Promise.all(
                snapshot.docs.map(async (d) => {
                  const raw = { ...d.data(), id: d.id } as Record<string, unknown> & { id: string };
                  return decryptFirestoreCompanyDocIfNeeded(raw, cryptoCtx, companyId);
                })
              )
            ).filter((x): x is NonNullable<typeof x> => x != null)
              .filter((item: any) => item.isDeleted !== true);
            if (cancelled) return;
            if (orderByField) {
              data.sort((a: any, b: any) => {
                const dateA = a[orderByField]?.toDate ? a[orderByField].toDate() : new Date(a[orderByField]);
                const dateB = b[orderByField]?.toDate ? b[orderByField].toDate() : new Date(b[orderByField]);
                return dateA.getTime() - dateB.getTime();
              });
            }
            let dataForUi = data;
            if (!isGroup) {
              const preferLocal =
                String(companyRef.current?.storageOption || "").toLowerCase() === "local";
              dataForUi = await mergeRemoteSnapshotWithLocalOnlyDocs(companyId, path, data, orderByField, {
                preferLocalSqliteWhenIdsConflict: preferLocal,
              });
            }
            const rowsForSetter = Array.isArray(dataForUi)
              ? dataForUi.map(stripMirrorMetaForEntityListRow)
              : dataForUi;
            // Har synced cloud company ke liye `company_docs` me debounced bake — airplane mode par pura ledger/masters SQLite se (sirf jo screen kholi thi wala data nahi).
            const persistSqliteFromSnap =
              !isGroup &&
              (shouldUseLocalCompanyData ||
                isCloudBackedCompany(companyRef.current as CloudBackedCompanyShape));
            // Static/APK: Firestore snapshot sirf transport — pehle SQLite commit, phir UI sirf `listCompanyDocsFromBrowserDb` se (web cloud par seedha snapshot UI).
            const staticSqliteFirst =
              isStaticApkLedgerTransportMode() && persistSqliteFromSnap && !isGroup;
            if (staticSqliteFirst) {
              await mirrorCollectionDocsToBrowserDbSilent(companyId, path, dataForUi, {
                cloudBackedOfflineCache: persistSqliteFromSnap && !shouldUseLocalCompanyData,
              });
              if (cancelled) return;
              try {
                const cached = await listCompanyDocsFromBrowserDb(companyId, path, { forBackupMerge: true });
                const alive = (cached as any[]).filter((x) => x?.isDeleted !== true);
                setter(sqliteCachedRowsForSetter(alive, orderByField));
              } catch {
                setter(rowsForSetter);
              }
            } else {
              // Snapshot = puri subcollection (Recent / dashboard dono ke liye sahi totals) — web hybrid default.
              setter(rowsForSetter);
              if (persistSqliteFromSnap) {
                const debounceKey = `${companyId}::${path}`;
                clearTimeout(mirrorSnapshotTimersRef.current[debounceKey]);
                mirrorSnapshotTimersRef.current[debounceKey] = setTimeout(() => {
                  void mirrorCollectionDocsToBrowserDbSilent(companyId, path, dataForUi, {
                    cloudBackedOfflineCache: persistSqliteFromSnap && !shouldUseLocalCompanyData,
                  });
                }, 500);
              }
            }
          })();
        }, (error: any) => {
          try {
            if (error?.code === 'unavailable' || error?.code === 'deadline-exceeded' || error?.message?.includes('network')) {
              listCompanyDocsFromBrowserDb(companyId, path, { forBackupMerge: true })
                .then((cached) => {
                  if (cancelled || !cached.length) return;
                  setter((prev) => mergeEntityListsById(prev, cached, orderByField));
                })
                .catch(() => {});
              return;
            }
            if (error?.code === 'permission-denied' || error?.code === 'PERMISSION_DENIED' || (error?.message && String(error.message).includes('permission'))) {
              console.warn(`[PERMISSION_DENIED TRACK] source=useVouchers path=companies/${companyId}/${path}`, { companyId, path, code: error?.code });
              if (isLocalOnlyMode()) {
                console.warn(`[Firestore] PERMISSION_DENIED in local mode for path: companies/${companyId}/${path}. Skipping clearCompanyId to keep current screen stable.`);
                return;
              }
              const co = companyRef.current;
              if (!co) {
                console.warn(`[Firestore] PERMISSION_DENIED but company not loaded yet – skipping clear to avoid Settings redirect.`);
                return;
              }
              const isOwner = co.ownerId === user?.uid || (!!co.ownerEmail && !!user?.email && co.ownerEmail.toLowerCase().trim() === user.email.toLowerCase().trim());
              if (!isOwner) {
                if (shouldSuppressTransientCompanyClear()) {
                  console.warn(
                    `[Firestore] PERMISSION_DENIED (shared user): skip clearCompanyId during APK save shield — companies/${companyId}/${path}`
                  );
                  return;
                }
                console.warn(`[Firestore] PERMISSION_DENIED for path: companies/${companyId}/${path}. Clearing invalid company selection.`, { companyId, path });
                try { clearCompanyId(); } catch (_) {}
              } else {
                console.warn(`[Firestore] PERMISSION_DENIED for path: companies/${companyId}/${path}. You are owner – check Firestore rules deploy or auth.`, { companyId, path });
              }
              return;
            }
            console.error(`Error fetching ${path}:`, error?.message || error);
            errorEmitter.emit('permission-error', new FirestorePermissionError({
              path: `companies/${companyId}/${path}`,
              operation: 'list'
            }));
          } catch (_) {}
        });
      });
      unsubRef.current = unsubscribers;

      const coPrefetch = companyRef.current;
      const prefetchFromSqlite =
        shouldUseLocalCompanyData ||
        String(coPrefetch?.storageOption || "").toLowerCase() === "firebase";
      if (prefetchFromSqlite) {
        for (const { path: p, setter: setCol, orderByField: obf } of collectionsToFetch) {
          listCompanyDocsFromBrowserDb(companyId, p, { forBackupMerge: true })
            .then((cached) => {
              if (cancelled || !cached.length) return;
              const alive = (cached as any[]).filter((x) => x?.isDeleted !== true);
              setCol((prev) => {
                const merged = mergeEntityListsById(prev, obf ? sortDocsByDateField(alive, obf) : alive, obf);
                return merged.filter((x: any) => x?.isDeleted !== true);
              });
            })
            .catch(() => {});
        }
      }

      const initialFetches = collectionsToFetch.map(({ path, isGroup, orderByField }) =>
        new Promise((resolve) => {
          const q = collectionListenerQuery(path, isGroup);
          const unsub = onSnapshot(q, () => { unsub(); resolve(true); }, (err: any) => {
            if (err?.code === 'permission-denied' || err?.code === 'PERMISSION_DENIED' || String(err?.message || '').includes('permission')) {
              console.warn('[PERMISSION_DENIED TRACK] source=useVouchers initialFetches path=companies/' + companyId + '/' + path, { companyId, path });
            }
            resolve(true);
          });
        })
      );
      Promise.all(initialFetches).then(() => { if (!cancelled) setLoading(false); });
      };
      const firestoreListenDelayMs = shouldUseLocalCompanyData ? 0 : 600;
      setTimeout(attachListeners, firestoreListenDelayMs);
    };

    // Airplane / cold wifi off: `firebase` storage company ko bhi pehle mirror hydrate —
    // warna sirf UI; `getDocFromServer` fail → niche catch tak bind kabhi lagta hi nahi tha (masters khali).
    const hydrateFromMirrorWhenOffline =
      typeof navigator !== "undefined" && navigator.onLine === false;

    if (hydrateFromMirrorWhenOffline) {
      bindHybridFirestoreToCompany({
        firestoreRemotePullAttempt:
          shouldUseLocalCompanyData || isCloudBackedCompany(companyRef.current as CloudBackedCompanyShape),
      });
    } else {
      getDocFromServer(companyRootDocRef)
        .then((snap) => {
          if (cancelled) return;
          if (!snap.exists()) {
            console.log("Company doc not in Firestore yet... skipping listeners.");
            setLoading(false);
            if (!shouldUseLocalCompanyData) {
              resetAllStates();
            }
            return;
          }
          const data = snap.data();
          const docOwnerId = data?.ownerId ?? "";
          const docOwnerEmail = (data?.ownerEmail ?? "").toString().toLowerCase().trim();
          const userEmail = (user?.email ?? "").toLowerCase().trim();
          const sharedEmails: string[] = (data?.sharedWithEmails ?? []).map((e: string) =>
            String(e).toLowerCase().trim()
          );
          const isOwner = docOwnerId === user?.uid || docOwnerEmail === userEmail;
          const isShared = userEmail && sharedEmails.includes(userEmail);
          if (!isOwner && !isShared) {
            console.log(
              "Company doc owner mismatch or not shared with user... skipping listeners."
            );
            setLoading(false);
            if (!shouldUseLocalCompanyData) {
              resetAllStates();
            }
            return;
          }
          bindHybridFirestoreToCompany({
            firestoreRemotePullAttempt:
              shouldUseLocalCompanyData ||
              isCloudBackedCompany(companyRef.current as CloudBackedCompanyShape),
          });
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          const ec = typeof err === "object" && err !== null ? (err as { code?: string }).code : "";
          const msg =
            typeof err === "object" && err !== null ? String((err as Error).message || "") : "";
          const networkLike =
            (typeof navigator !== "undefined" && navigator.onLine === false) ||
            ec === "unavailable" ||
            ec === "deadline-exceeded" ||
            ec === "failed-precondition" ||
            msg.toLowerCase().includes("network") ||
            msg.toLowerCase().includes("failed to fetch");

          // APK local company + stale build path (purana guard) + reachable-Firestore-fail mirrors
          if (networkLike || (shouldUseLocalCompanyData && isStaticAppBuild())) {
            bindHybridFirestoreToCompany({
              firestoreRemotePullAttempt: networkLike
                ? false
                : shouldUseLocalCompanyData || isCloudBackedCompany(companyRef.current as CloudBackedCompanyShape),
            });
            return;
          }
          // Non-network rejection: bind mat karo; spinner band
          setLoading(false);
        });
    }

    return () => {
      cancelled = true;
      for (const t of Object.values(mirrorSnapshotTimersRef.current)) clearTimeout(t);
      mirrorSnapshotTimersRef.current = {};
      unsubRef.current.forEach(u => u());
      unsubRef.current = [];
    };
  }, [companyId, voucherListenerCompanyKey, user?.uid, user?.email, authLoading, localAuthEpoch, pathname]);

  // Single-doc / write-path upsert ke baad merge (notify) — collections ke hisaab se state update.
  useEffect(() => {
    const co = company as CloudBackedCompanyShape | null | undefined;
    const shouldListenSqliteBump =
      !!companyId &&
      (isLocalOnlyMode() ||
        String(co?.storageOption || "").toLowerCase() === "local" ||
        isCloudBackedCompany(co));
    if (shouldSkipHeavyVoucherBootstrap(pathname)) return;
    if (!shouldListenSqliteBump) return;
    const onBump = (ev: Event) => {
      const d = (ev as CustomEvent<BrowserDbCollectionBumpDetail>).detail;
      if (!d || d.companyId !== companyId || !d.collection) return;
      const coll = d.collection;
      listCompanyDocsFromBrowserDb(companyId, coll, { forBackupMerge: true })
        .then((cached) => {
          if (!cached.length) return;
          // Browser DB notify merge: deleted rows ko rehydrate hone se roko (sirf Recycle Bin me visible).
          const aliveCached = (cached as any[]).filter(isAliveDoc);
          switch (coll) {
            case "vouchers":
              setVouchers((prev) =>
                mergeEntityListsById(prev.filter(isAliveDoc), aliveCached, "date").filter(isAliveDoc)
              );
              break;
            case "parties":
              setParties((prev) => mergeEntityListsById(prev.filter(isAliveDoc), aliveCached).filter(isAliveDoc));
              break;
            case "staff":
              setStaff((prev) => mergeEntityListsById(prev.filter(isAliveDoc), aliveCached).filter(isAliveDoc));
              break;
            case "bank_accounts":
              setAccounts((prev) => mergeEntityListsById(prev.filter(isAliveDoc), aliveCached).filter(isAliveDoc));
              break;
            case "taxes":
              setTaxes((prev) => mergeEntityListsById(prev.filter(isAliveDoc), aliveCached).filter(isAliveDoc));
              break;
            case "expense_accounts":
              setUnprocessedExpenseAccounts((prev) =>
                mergeEntityListsById(prev.filter(isAliveDoc), aliveCached).filter(isAliveDoc)
              );
              break;
            case "items":
              setItems((prev) => mergeEntityListsById(prev.filter(isAliveDoc), aliveCached).filter(isAliveDoc));
              break;
            case "item_groups":
              setItemGroups((prev) => mergeEntityListsById(prev.filter(isAliveDoc), aliveCached).filter(isAliveDoc));
              break;
            case "groups":
              setGroups((prev) => mergeEntityListsById(prev.filter(isAliveDoc), aliveCached).filter(isAliveDoc));
              break;
            case "account_groups":
              setAccountGroups((prev) => mergeEntityListsById(prev.filter(isAliveDoc), aliveCached).filter(isAliveDoc));
              break;
            case "staff_groups":
              setStaffGroups((prev) => mergeEntityListsById(prev.filter(isAliveDoc), aliveCached).filter(isAliveDoc));
              break;
            case "tax_groups":
              setTaxGroups((prev) => mergeEntityListsById(prev.filter(isAliveDoc), aliveCached).filter(isAliveDoc));
              break;
            case "expense_groups":
              setExpenseGroups((prev) => mergeEntityListsById(prev.filter(isAliveDoc), aliveCached).filter(isAliveDoc));
              break;
            default:
              break;
          }
        })
        .catch(() => {});
    };
    window.addEventListener(BROWSER_DB_COLLECTION_BUMP, onBump);
    return () => window.removeEventListener(BROWSER_DB_COLLECTION_BUMP, onBump);
  }, [
    companyId,
    company?.storageOption,
    company?.syncedFromCloud,
    company?.syncPolicy,
    company?.authoritativeCompanyId,
    pathname
  ]);

  /** Voucher/account/user display names: masters se pehle, bounded Firestore chunk — `collection('users')` full scan hata (400+ vouchers / large user base = hang). */
  useEffect(() => {
    if (!vouchersForDisplay.length) return;

    let cancelled = false;
    const debounceMs = vouchersForDisplay.length > 120 ? 450 : 200;
    const timer = window.setTimeout(() => {
      void (async () => {
        const idsToFetch = new Set<string>();
        const userIdsToFetch = new Set<string>();

        vouchersForDisplay.forEach((v) => {
          if (v.userId) userIdsToFetch.add(v.userId);
          const accountFields = [
            "partyId",
            "accountId",
            "fromAccountId",
            "toAccountId",
            "staffId",
            "taxAccountId",
            "incomeAccountId",
            "expenseAccountId",
          ];
          accountFields.forEach((field) => {
            if (v[field]) idsToFetch.add(v[field]);
          });
          (v.entries || []).forEach((e: any) => {
            if (e.accountId) idsToFetch.add(e.accountId);
          });
        });

        const newAccountNames: Record<string, string> = {};
        const masterLookup = buildJournalLinkedEntityNameLookup(
          parties,
          staff,
          accounts,
          taxes,
          unprocessedExpenseAccounts,
          items
        );
        const journalSnapshot = journalAccountNamesRef.current;

        for (const id of idsToFetch) {
          if (!id) continue;
          const sid = String(id);
          if (journalSnapshot[sid]) continue;
          const fromMaster = masterLookup.get(sid);
          if (fromMaster) newAccountNames[sid] = fromMaster;
        }

        const firestoreAccountIds = [...idsToFetch]
          .map((id) => String(id))
          .filter((sid) => sid && !journalSnapshot[sid] && !newAccountNames[sid]);

        if (!cancelled && !isLocalCompanySelected && companyId && firestoreAccountIds.length) {
          const fromFs = await resolveJournalAccountFirestoreParallel(
            companyId,
            firestoreAccountIds,
            () => cancelled,
            12
          );
          Object.assign(newAccountNames, fromFs);
        }

        const newUserNames: Record<string, string> = {};
        const localUserNameById: Record<string, string> = {};
        const localSessionUser = isLocalCompanySelected && companyId ? getLocalAuthUser(companyId) : null;
        const localSessionDisplayName =
          (localSessionUser?.displayName || localSessionUser?.username || "").trim() ||
          (((company as any)?.adminUsername as string) || "").trim() ||
          "Admin";

        localUserNameById["local"] = localSessionDisplayName;
        localUserNameById["local_guest_user"] = localSessionDisplayName;
        if (localSessionUser?.id) localUserNameById[String(localSessionUser.id)] = localSessionDisplayName;
        if (localSessionUser?.username) localUserNameById[String(localSessionUser.username)] = localSessionDisplayName;

        const nameSnapshot = userNamesRef.current;
        vouchersForDisplay.forEach((v: any) => {
          const uid = v?.userId;
          let fromVoucher = v?.userDisplayName || v?.userName || null;
          if (fromVoucher && String(fromVoucher).toLowerCase().trim() === "local") {
            fromVoucher = localSessionDisplayName;
          }
          if (!uid || !fromVoucher) return;
          // "Auto" uid map me mat daalo — baaki rows ke liye asli naam Firestore se aaye
          if (isRecurringAutoUserDisplayLabel(fromVoucher)) return;
          if (fromVoucher !== "Unknown" && fromVoucher !== "N/A") {
            if ((nameSnapshot[uid] || "") !== fromVoucher) {
              newUserNames[uid] = fromVoucher;
            }
          }
        });

        if (isLocalCompanySelected && companyId) {
          try {
            const localDoc = await getLocalCompanyById(companyId);
            const localUsers = parseLocalCompanyUserRows(
              (localDoc as { localCompanyUsers?: unknown } | null)?.localCompanyUsers
            );
            localUsers.forEach((u) => {
              const display = (u.displayName || u.username || "").trim();
              if (!display) return;
              if (u.id) localUserNameById[String(u.id)] = display;
              if (u.username) localUserNameById[String(u.username)] = display;
            });
          } catch {
            // Non-blocking: voucher grid naam fallback chain se bhar sakta hai.
          }
        }

        const currentUserName = user ? (customUser?.displayName || user.displayName || user.email || "You") : "";

        for (const uid of userIdsToFetch) {
          if (!uid) continue;
          if (newUserNames[uid]) continue;
          const existingUn = nameSnapshot[uid] || "";
          if (existingUn && existingUn !== "Unknown" && existingUn !== "N/A") continue;

          if (uid === user?.uid && currentUserName) {
            if (existingUn !== currentUserName) newUserNames[uid] = currentUserName;
            continue;
          }
          if (localUserNameById[uid]) {
            const resolved = localUserNameById[uid];
            if (existingUn !== resolved) newUserNames[uid] = resolved;
            continue;
          }

          const ownerEmail = (company as any)?.ownerEmail as string | undefined;
          const ownerPrefix = ownerEmail?.includes("@") ? ownerEmail.split("@")[0] : "";
          if (uid === (company as any)?.ownerId && ownerPrefix) {
            if (existingUn !== ownerPrefix) newUserNames[uid] = ownerPrefix;
            continue;
          }

          const sharedUser = ((company as any)?.sharedWith || []).find((su: any) => su?.uid === uid);
          if (sharedUser?.name) {
            const sharedName = String(sharedUser.name);
            if (existingUn !== sharedName) newUserNames[uid] = sharedName;
            continue;
          }
        }

        const uidsNeedingFirestore = [...userIdsToFetch].filter((uid) => {
          if (!uid || isLocalCompanySelected || cancelled) return false;
          if (newUserNames[uid]) return false;
          const ex = nameSnapshot[uid] || "";
          return !ex || ex === "Unknown" || ex === "N/A";
        });

        if (uidsNeedingFirestore.length && !cancelled) {
          const bulkFetched = await batchFetchUserDisplayNamesFromFirestore(uidsNeedingFirestore, () => cancelled);
          for (const [uidKey, nm] of Object.entries(bulkFetched)) {
            if (!nm || nm === "Unknown" || nm === "N/A") continue;
            if ((nameSnapshot[uidKey] || "") !== nm) newUserNames[uidKey] = nm;
          }
        }

        if (cancelled) return;

        if (Object.keys(newAccountNames).length > 0) {
          setJournalAccountNames((prev) => ({ ...prev, ...newAccountNames }));
        }
        if (Object.keys(newUserNames).length > 0) {
          setUserNames((prev) => {
            let changed = false;
            const next = { ...prev };
            for (const [uid, name] of Object.entries(newUserNames)) {
              if ((next[uid] || "") !== name) {
                next[uid] = name;
                changed = true;
              }
            }
            return changed ? next : prev;
          });
        }
      })();
    }, debounceMs);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    vouchersForDisplay,
    parties,
    staff,
    accounts,
    taxes,
    unprocessedExpenseAccounts,
    items,
    companyId,
    isLocalCompanySelected,
    company,
    user,
    customUser,
  ]);


  // --- Optimization: Calculate Aggregates ONCE ---
  // This replaces the nested loops. We loop vouchers once and build Maps.
  const voucherAggregates = useMemo(() => {
    const partyMap = new Map<string, { debit: number; credit: number }>();
    const staffMap = new Map<string, { debit: number; credit: number }>();
    const accountMap = new Map<string, { debit: number; credit: number }>();
    const taxMap = new Map<string, { debit: number; credit: number }>();
    const expenseMap = new Map<string, { debit: number; credit: number }>();
    
    // For items, we need specific stock tracking
    const itemMap = new Map<string, { debit: number; credit: number; stockIn: number; stockOut: number }>();

    // Helper to safely add to map
    const addVal = (map: Map<string, any>, id: string, type: 'debit' | 'credit', val: number) => {
        if (!id) return;
        const current = map.get(id) || { debit: 0, credit: 0, stockIn: 0, stockOut: 0 };
        if (type === 'debit') current.debit += val;
        else current.credit += val;
        map.set(id, current);
    };

    // Pre-create Item Map for faster Unit Conversion lookup inside the loop
    const itemConfigMap = new Map<string, Item>();
    items.forEach(i => itemConfigMap.set(i.id, i));

    vouchersForDisplay.forEach(v => {
        const amount = Number(v.amount || v.total || 0);
        const subTotal = Number(v.subTotal || amount);

        // --- Staff Logic ---
        if (v.type === "journal" && v.subType === "add_salary" && Array.isArray(v.entries)) {
            v.entries.forEach((entry: any) => {
                const isStaff = staff.some(s => s.id === entry.accountId);
                if (isStaff) {
                  addVal(staffMap, entry.accountId, 'credit', Number(entry.credit || 0));
                }
            });
        } else if (v.staffId) {
            if (v.type === "payment_out") {
                addVal(staffMap, v.staffId, 'debit', amount);
            } else if (v.type === "payment_in") {
                addVal(staffMap, v.staffId, 'credit', amount);
            }
        }
        
        // --- Party Logic ---
        if (v.partyId) {
            if (["sale", "payment_out", "direct_income"].includes(v.type)) {
                addVal(partyMap, v.partyId, 'debit', amount);
            } else if (["purchase", "payment_in", "direct_expense"].includes(v.type)) {
                addVal(partyMap, v.partyId, 'credit', amount);
            }
        }

        // --- Sale/Purchase accounts (respect selected account on voucher; keep legacy fallback ids) ---
        if (v.type === "sale") {
            const selectedSalesAccountId = v.salesAccountId || v.incomeAccountId || "sales_account";
            addVal(expenseMap, selectedSalesAccountId, 'credit', subTotal);
        } else if (v.type === "purchase") {
            const selectedPurchaseAccountId = v.purchaseAccountId || v.expenseAccountId || "purchase_account";
            addVal(expenseMap, selectedPurchaseAccountId, 'debit', subTotal);
        }

        // --- Account Logic ---
        const fromAccId = v.fromAccountId || v.accountId;
        if (fromAccId) {
             if (['payment_in', 'direct_income', 'sale'].includes(v.type)) addVal(accountMap, fromAccId, 'debit', amount);
             else if (['payment_out', 'direct_expense', 'purchase'].includes(v.type)) addVal(accountMap, fromAccId, 'credit', amount);
        }
        
        // Contra Logic for Accounts
        if (v.type === 'contra') {
            if (v.toAccountId) addVal(accountMap, v.toAccountId, 'debit', amount);
            if (v.fromAccountId) addVal(accountMap, v.fromAccountId, 'credit', amount);
        }

        // --- Tax Logic ---
        if (v.taxAccountId) {
             if (v.type === 'payment_out') addVal(taxMap, v.taxAccountId, 'debit', amount);
             else if (v.type === 'payment_in') addVal(taxMap, v.taxAccountId, 'credit', amount);
        }

        // --- Direct/Indirect Income-Expense (Expense Accounts) ---
        // Receipt mapped to income account.
        if (v.type === "payment_in") {
            const incomeAccId = v.incomeAccountId || v.toAccountId;
            if (incomeAccId) addVal(expenseMap, incomeAccId, 'credit', amount);
        }
        // Payment mapped to expense account.
        if (v.type === "payment_out") {
            const expenseAccId = v.expenseAccountId || v.toAccountId;
            if (expenseAccId) addVal(expenseMap, expenseAccId, 'debit', amount);
        }

        // Inter Company — compound legs (entity + IC counterparty + bank)
        if (v.type === "inter_company") {
            if (!isInterCompanyVisibleOnTargetBank(v as Record<string, unknown>)) {
                // Target: source approve se pehle balance maps me mat jodo
            } else {
            const legs = resolveInterCompanyLegsForVoucher(v as Record<string, unknown>);
            if (legs.length > 0) {
                legs.forEach((leg) => {
                    const map =
                        leg.kind === "party"
                            ? partyMap
                            : leg.kind === "bank"
                              ? accountMap
                              : leg.kind === "staff"
                                ? staffMap
                                : leg.kind === "tax"
                                  ? taxMap
                                  : expenseMap;
                    if (leg.debit > 0) addVal(map, leg.accountId, "debit", leg.debit);
                    if (leg.credit > 0) addVal(map, leg.accountId, "credit", leg.credit);
                });
            } else if (v.partyId) {
                const side = String((v as { interCompanyLink?: { role?: string } }).interCompanyLink?.role || "");
                if (side === "source") addVal(partyMap, v.partyId, "debit", amount);
                else if (side === "target" && v.isApproved === true) addVal(partyMap, v.partyId, "credit", amount);
            }
            }
        }
        if (v.type === "direct_income" && v.incomeAccountId) {
            addVal(expenseMap, v.incomeAccountId, 'credit', amount);
        } else if (["direct_expense"].includes(v.type)) {
            const toAccId = v.toAccountId || v.expenseAccountId;
            if (toAccId) addVal(expenseMap, toAccId, 'debit', amount);
        }

        // --- Line Items (For Tax & Items) ---
        if (v.lineItems && Array.isArray(v.lineItems)) {
            v.lineItems.forEach((line: any) => {
                // Line Tax
                if (line.taxAccountId && line.taxAmount) {
                      const tAmt = Number(line.taxAmount);
                      if (v.type === 'purchase') addVal(taxMap, line.taxAccountId, 'debit', tAmt);
                      else if (v.type === 'sale') addVal(taxMap, line.taxAccountId, 'credit', tAmt);
                }

                // --- Item Stock Logic ---
                if (line.itemId) {
                    const item = itemConfigMap.get(line.itemId);
                    if (item) {
                        const current = itemMap.get(line.itemId) || { debit: 0, credit: 0, stockIn: 0, stockOut: 0 };
                        const qty = Number(line.quantity) || 0;
                        const rate = Number(line.rate) || 0;
                        const lineAmount = qty * rate;

                        if (v.type === 'purchase') current.debit += lineAmount;
                        if (v.type === 'sale') {
                           current.credit += v.totalPurchasePrice && v.totalPurchasePrice > 0 ? v.totalPurchasePrice : (qty * (item.purchasePrice || rate));
                        }

                        const conversions = (item.unitConversions || []) as any[];
                        const smallestUnit = conversions.length > 0 ? conversions[conversions.length - 1].toUnit : ((item as any).openingBalanceUnit || '');
                        
                        // Helper to get factor (inline to access closures)
                        let factor = 1;
                        if (line.unit && line.unit !== smallestUnit) {
                            let currentUnit = line.unit;
                             // Basic loop to find path to smallest unit. 
                             // Optimized: assuming direct chain for now or simple list match
                             // Logic: If I have 1 Box, and 1 Box = 10 Pcs (Base). Factor is 10.
                             // Loop: Find conversion where fromUnit == currentUnit. 
                             let found = false;
                             // Limit loop to prevent infinite
                             for(let k=0; k<10; k++) {
                                 const conv = conversions.find((c:any) => c.fromUnit === currentUnit);
                                 if(!conv) break;
                                 factor *= Number(conv.conversionFactor) || 1;
                                 currentUnit = conv.toUnit;
                                 if(currentUnit === smallestUnit) {
                                     found = true;
                                     break;
                                 }
                             }
                        }

                        const standardizedQty = qty * factor;

                        if (v.type === 'purchase') current.stockIn += standardizedQty;
                        if (v.type === 'sale') current.stockOut += standardizedQty;

                        itemMap.set(line.itemId, current);
                    }
                }
            });
        }

        // --- Journal Entries ---
        if (v.type === "journal" && Array.isArray(v.entries)) {
            v.entries.forEach((entry: any) => {
                const d = Number(entry.debit || 0);
                const c = Number(entry.credit || 0);
                if (entry.accountId) {
                    addVal(partyMap, entry.accountId, 'debit', d); addVal(partyMap, entry.accountId, 'credit', c);
                    if (v.subType !== 'add_salary') { // Corrected: only apply to non-salary journals
                       addVal(staffMap, entry.accountId, 'debit', d); addVal(staffMap, entry.accountId, 'credit', c);
                    }
                    addVal(accountMap, entry.accountId, 'debit', d); addVal(accountMap, entry.accountId, 'credit', c);
                    addVal(taxMap, entry.accountId, 'debit', d); addVal(taxMap, entry.accountId, 'credit', c);
                    addVal(expenseMap, entry.accountId, 'debit', d); addVal(expenseMap, entry.accountId, 'credit', c);
                }
            });
        }
    });

    return { partyMap, staffMap, accountMap, taxMap, expenseMap, itemMap };
  }, [vouchersForDisplay, items, staff]); // Added items dependency so itemMap rebuilds if items change


 const processedParties: ProcessedParty[] = useMemo(() => {
    // Return early if the necessary data isn't loaded yet.
    if (loading || !parties || !unprocessedExpenseAccounts) {
        return previousData.current.processedParties || [];
    }
    const regularParties = parties.map(p => {
        const stats = voucherAggregates.partyMap.get(p.id) || { debit: 0, credit: 0 };
        // For Opening Balance ledger, balance should equal openingBalance (no transactions)
        const isOpeningBalanceLedger = p.id === 'opening_balance_ledger';
        const balance = isOpeningBalanceLedger 
          ? (Number(p.openingBalance) || 0)
          : (Number(p.openingBalance) || 0) + stats.debit - stats.credit;
        return {
            ...p,
            openingBalance: Number(p.openingBalance) || 0, // Preserve openingBalance field
            debit: isOpeningBalanceLedger ? (balance > 0 ? balance : 0) : stats.debit,
            credit: isOpeningBalanceLedger ? (balance < 0 ? Math.abs(balance) : 0) : stats.credit,
            balance,
            isSystemAccount: (p as any).isSystemReserved || (p as any).isSystemAccount || false,
        };
    }).filter(p => !p.isDeleted);
    
    const systemIds = ['sales_account', 'purchase_account'];
    const systemParties = systemIds.map(id => {
        const stats = voucherAggregates.expenseMap.get(id) || { debit: 0, credit: 0 };
        const originalAcc = unprocessedExpenseAccounts.find(a => a.id === id);
        return {
            id,
            name: originalAcc?.name || (id === 'sales_account' ? 'Sales Account' : 'Purchase Account'),
            groupId: id === 'sales_account' ? 'income' : 'expenses',
            debit: stats.debit,
            credit: stats.credit,
            balance: stats.debit - stats.credit,
            isSystemAccount: (originalAcc as any)?.isSystemReserved || true
        } as ProcessedParty;
    }).filter(sp => sp.debit !== 0 || sp.credit !== 0);

    return [...regularParties, ...systemParties];
}, [parties, voucherAggregates.partyMap, voucherAggregates.expenseMap, unprocessedExpenseAccounts, loading]);

  const processedPartiesForSelection: ProcessedParty[] = useMemo(
    () => processedParties.filter(
      (p) => !REPORT_ONLY_PARTY_IDS.includes(p.id as any) && !PARTY_SELECTION_HIDDEN_IDS.includes(p.id as any)
    ),
    [processedParties]
  );

  const { overdueTransactions, hasOverdueTransactions } = useMemo(() => {
    const allocatedBySale = getAllocatedByVoucherId(vouchersForDisplay);
    const allocatedByPurchase = getAllocatedByVoucherIdFromPaymentOuts(vouchersForDisplay);
    const allocatedToSaleFromPurchase = getAllocatedByVoucherIdFromPurchase(vouchersForDisplay);
    const allocatedToPurchaseFromSale = getAllocatedByVoucherIdFromSale(vouchersForDisplay);
    const allocatedFromJournal = getAllocatedByVoucherIdFromJournal(vouchersForDisplay);
    const partyNameById = new Map(processedParties.map((p) => [p.id, p.name]));
    const list: Array<{ id: string; type: string; date: any; voucherNumber: string; partyId: string; partyName: string; total: number; outstanding: number; debit: number; credit: number; dueDate?: any; isOverdue: boolean; paymentStatus: string; overdueImportant?: boolean; userId?: string; userName?: string; narration?: string; createdAt?: any; lastEditedAt?: any; updatedAt?: any }> = [];
    for (const v of vouchersForDisplay) {
      if ((v.type !== "sale" && v.type !== "purchase") || !v.partyId) continue;
      const total = Number(v.total ?? v.amount ?? ((v.subTotal ?? 0) - (v.discount ?? 0) + (v.tax ?? 0))) || 0;
      const fromPayments = v.type === "sale"
        ? (allocatedBySale.get(v.id) ?? 0) + (allocatedToSaleFromPurchase.get(v.id) ?? 0)
        : (allocatedByPurchase.get(v.id) ?? 0) + (allocatedToPurchaseFromSale.get(v.id) ?? 0);
      const fromJournal = allocatedFromJournal.get(v.id) ?? 0;
      const fromOB = Number(v.openingBalanceAllocated) || 0;
      const outgoingToOpposite = getOutgoingAllocatedToOpposite(v);
      const allocated = fromPayments + fromJournal + fromOB + outgoingToOpposite;
      const result = getPaymentStatusResult(total, allocated, v.dueDate);
      if (!result.isOverdue) continue;
      const partyName = partyNameById.get(v.partyId) ?? v.partyId;
      const outstanding = result.outstanding;
      const debit = v.type === "sale" ? outstanding : 0;
      const credit = v.type === "purchase" ? outstanding : 0;
      const fallbackUserId =
        v.userId ||
        v.createdBy ||
        v.createdByUserId ||
        v.changedBy ||
        v.uid;
      const fallbackUserName =
        v.userDisplayName ||
        v.userName ||
        v.createdByName ||
        v.changedByName ||
        undefined;
      list.push({
        id: v.id,
        type: v.type,
        date: v.date,
        voucherNumber: v.voucherNumber ?? v.id,
        partyId: v.partyId,
        partyName,
        total,
        outstanding,
        debit,
        credit,
        dueDate: v.dueDate,
        isOverdue: true,
        paymentStatus: "overdue",
        overdueImportant: (v as { overdueImportant?: boolean }).overdueImportant === true,
        userId: fallbackUserId,
        userName: fallbackUserName,
        narration: (v as any).narration,
        createdAt: (v as any).createdAt,
        lastEditedAt: (v as any).lastEditedAt,
        updatedAt: (v as any).updatedAt,
      });
    }
    return { overdueTransactions: list, hasOverdueTransactions: list.length > 0 };
  }, [vouchersForDisplay, processedParties]);

  const processedStaff: ProcessedStaff[] = useMemo(() => {
    return staff.map(s => {
        const stats = voucherAggregates.staffMap.get(s.id) || { debit: 0, credit: 0 };
        return {
            ...s,
            openingBalance: Number(s.openingBalance) || 0,
            debit: stats.debit,
            credit: stats.credit,
            balance: (Number(s.openingBalance) || 0) + stats.debit - stats.credit
        };
    }).filter(s => !s.isDeleted);
  }, [staff, voucherAggregates.staffMap]);

  const processedAccounts: ProcessedAccount[] = useMemo(() => {
    return accounts.map(a => {
        const stats = voucherAggregates.accountMap.get(a.id) || { debit: 0, credit: 0 };
        return {
            ...a,
            debit: stats.debit,
            credit: stats.credit,
            balance: (Number(a.openingBalance) || 0) + stats.debit - stats.credit
        };
    }).filter(a => !a.isDeleted);
  }, [accounts, voucherAggregates.accountMap]);

  const processedTaxes: ProcessedTax[] = useMemo(() => {
    return taxes.map(t => {
        const stats = voucherAggregates.taxMap.get(t.id) || { debit: 0, credit: 0 };
        return {
            ...t,
            debit: stats.debit,
            credit: stats.credit,
            balance: (Number(t.openingBalance) || 0) + stats.debit - stats.credit
        };
    }).filter(t => !t.isDeleted);
  }, [taxes, voucherAggregates.taxMap]);

  const processedExpenseAccounts: ProcessedExpenseAccount[] = useMemo(() => {
    return unprocessedExpenseAccounts.map(e => {
        const stats = voucherAggregates.expenseMap.get(e.id) || { debit: 0, credit: 0 };
        return {
            ...e,
            debit: stats.debit,
            credit: stats.credit,
            balance: (Number((e as any).openingBalance) || 0) + stats.debit - stats.credit
        };
    }).filter(e => !e.isDeleted);
  }, [unprocessedExpenseAccounts, voucherAggregates.expenseMap]);
  
  const expenseAccounts = processedExpenseAccounts;

  // --- Item Processing ---
  // Using the pre-calculated itemMap from aggregates
  const processedItems: ProcessedItem[] = useMemo(() => {
    return items.map(item => {
        const stats = voucherAggregates.itemMap.get(item.id) || { debit: 0, credit: 0, stockIn: 0, stockOut: 0 };
        const newItem: ProcessedItem = { ...item, ...stats }; // Copy stats directly

        const conversions = (item.unitConversions || []) as any[];
        const smallestUnit = conversions.length > 0 ? conversions[conversions.length - 1].toUnit : ((item as any).openingBalanceUnit || '');
        
        const getFactor = (unit: string) => {
             if (!unit || conversions.length === 0) return 1;
             if (unit === smallestUnit) return 1;
             let factor = 1;
             let currentUnit = unit;
             for (let i=0; i < 10; i++) { // safety break
                const conv = conversions.find((c:any) => c.fromUnit === currentUnit);
                if (!conv) return 0; 
                factor *= Number(conv.conversionFactor) || 1;
                currentUnit = conv.toUnit;
                if (currentUnit === smallestUnit) break;
             }
             return factor;
        };
        const openingUnit = (item as any).openingBalanceUnit || (conversions.length > 0 ? conversions[0].fromUnit : "");
        const openingStockInSmallest = (Number(item.openingBalance) || 0) * (openingUnit ? getFactor(openingUnit) : 1);
        
        // Calculate Final Stock Qty
        newItem.stockQty = openingStockInSmallest + (stats.stockIn || 0) - (stats.stockOut || 0);
        
        // Calculate Financial Balance
        newItem.balance = (Number(item.openingBalance) || 0) * (Number(item.openingBalanceRate) || 0) + stats.debit - stats.credit;

        // Calculate Display Qty
        const displayUnitFactor = getFactor((item as any).displayUnit || smallestUnit || '');
        
        newItem.displayStockQty = displayUnitFactor > 0 ? newItem.stockQty / displayUnitFactor : 0;
        
        return newItem;
      });
  }, [items, voucherAggregates.itemMap]); // Only re-run if items or aggregated stats change


  // --- Group Processing (Standard Aggregation) ---
  const processGroups = useCallback((groups: any[], items: any[]) => {
      const groupMap = new Map<string, any>();
      groups.forEach(g => groupMap.set(g.id, { ...g, debit: 0, credit: 0, balance: 0, openingBalance: Number(g.openingBalance || 0) }));

      items.forEach(item => {
          if (item.groupId && groupMap.has(item.groupId)) {
              const g = groupMap.get(item.groupId);
              const isItemGroup = 'purchasePrice' in item;

              if (isItemGroup) {
                // For item groups, balance = opening value + purchase values - cogs
                g.debit += item.debit || 0;
                g.credit += item.credit || 0;
                const itemOpeningValue = (Number(item.openingBalance) || 0) * (Number(item.openingBalanceRate) || 1);
                g.openingBalance += itemOpeningValue;
              } else {
                // For other groups, use standard debit/credit
                g.debit += item.debit || 0;
                g.credit += item.credit || 0;
                g.openingBalance += (Number(item.openingBalance) || 0);
              }
          }
      });
      
      const sortedGroups = [...groupMap.values()].sort((a,b) => (a.parentId ? 1 : -1));
      
      sortedGroups.forEach(g => {
         g.balance = g.openingBalance + g.debit - g.credit; 
      });
      
       sortedGroups.forEach(g => {
         if (g.parentId && groupMap.has(g.parentId)) {
             const parent = groupMap.get(g.parentId);
             parent.debit += g.debit;
             parent.credit += g.credit;
             parent.openingBalance += g.openingBalance;
             parent.balance = parent.openingBalance + parent.debit - parent.credit;
         }
      });

      return Array.from(groupMap.values()).filter(g => !g.isDeleted);
  }, []);

  const processedGroups = useMemo(() => processGroups(groups, processedParties), [groups, processedParties, processGroups]);
  const processedStaffGroups = useMemo(() => processGroups(staffGroups, processedStaff), [staffGroups, processedStaff, processGroups]);
  const processedAccountGroups = useMemo(() => processGroups(accountGroups, processedAccounts), [accountGroups, processedAccounts, processGroups]);
  const processedTaxGroups = useMemo(() => processGroups(taxGroups, processedTaxes), [taxGroups, processedTaxes, processGroups]);
  const processedItemGroups = useMemo(() => processGroups(itemGroups, processedItems), [itemGroups, processedItems, processGroups]);
  const processedExpenseGroups = useMemo(() => processGroups(expenseGroups, processedExpenseAccounts), [expenseGroups, processedExpenseAccounts, processGroups]);

  // Pre-load names from collections (available immediately) so transactions show names, not UIDs
  const journalAccountNamesMerged = useMemo(() => {
    const preloaded: Record<string, string> = {};
    processedParties.forEach((p) => { preloaded[p.id] = p.name; });
    processedAccounts.forEach((a) => { preloaded[a.id] = a.accountName; });
    processedStaff.forEach((s) => { preloaded[s.id] = s.name; });
    processedTaxes.forEach((t) => { preloaded[t.id] = t.name; });
    processedExpenseAccounts.forEach((e) => { preloaded[e.id] = e.name; });
    processedItems.forEach((i) => { preloaded[i.id] = i.name; });
    // Fetched names first; master lists win so async "Unknown Account" never overwrites real entity names.
    return { ...journalAccountNames, ...preloaded };
  }, [processedParties, processedAccounts, processedStaff, processedTaxes, processedExpenseAccounts, processedItems, journalAccountNames]);
  
  const value = useMemo(() => {
    const currentData = {
        vouchers: vouchersForDisplay,
        // `vouchersAll` bhi alive-only rakho; reports/status logic me deleted voucher leak na ho.
        vouchersAll: vouchers.filter(isAliveDoc),
        loading,
        processedParties, 
        processedPartiesForSelection, 
        processedStaff, 
        processedAccounts, 
        processedTaxes, 
        expenseAccounts, 
        processedItems, 
        processedItemGroups, 
        processedGroups, 
        processedAccountGroups, 
        processedStaffGroups, 
        processedTaxGroups,
        processedExpenseAccounts,
        processedExpenseGroups,
        journalAccountNames: journalAccountNamesMerged,
        userNames,
        overdueTransactions,
        hasOverdueTransactions,
    };
    
    return currentData;
  }, [
    vouchersForDisplay, vouchers, loading, processedParties, processedPartiesForSelection, processedStaff, processedAccounts, 
    processedTaxes, expenseAccounts, processedItems, processedItemGroups, 
    processedGroups, processedAccountGroups, processedStaffGroups, processedTaxGroups,
    processedExpenseAccounts, processedExpenseGroups, journalAccountNamesMerged, userNames,
    overdueTransactions, hasOverdueTransactions
  ]);

  /** Jis company ka data last stable render me dikha (same-company refresh vs company switch alag karte hain). */
  const lastStableDisplayCompanyIdRef = useRef<string | null>(null);

  // Company badalte hi stable ref hatao — warna purani id se `sameCompany === true` ho kar display path galat ho (nested dialog / fast switch).
  useEffect(() => {
    lastStableDisplayCompanyIdRef.current = null;
  }, [companyId]);

  // Update ref in useEffect to avoid accessing refs during render
  useEffect(() => {
    if (!loading) {
      previousData.current = value;
      // Loading complete: ab is company ka snapshot “stable” maan sakte hain (nested dialog target change ke baad bhi).
      lastStableDisplayCompanyIdRef.current = companyId ? String(companyId) : null;
    }
  }, [loading, value, companyId]);

  // Use state to track the display value to avoid ref access during render
  const [displayValue, setDisplayValue] = useState(() => value);

  useEffect(() => {
    if (loading) {
      const sameCompany =
        lastStableDisplayCompanyIdRef.current != null &&
        companyId != null &&
        String(lastStableDisplayCompanyIdRef.current) === String(companyId);
      // Sirf same company par purana snapshot + loading: UI flicker kam. Company switch (e.g. voucher dialog target)
      // par purani company ke vouchers mat dikhayo — bill-wise/spend-wise counts + forms galat company ke ho jate the.
      if (sameCompany) {
        setDisplayValue({
          ...previousData.current,
          loading: true,
        });
      } else {
        setDisplayValue(value);
      }
    } else {
      setDisplayValue(value);
    }
  }, [loading, value, companyId]);

  return (
    <VoucherContext.Provider value={displayValue}>
      {children}
    </VoucherContext.Provider>
  );
};

export const useVouchers = () => {
  const context = useContext(VoucherContext);
  if (context === undefined) {
    throw new Error("useVouchers must be used within a VoucherProvider");
  }
  return context;
};

