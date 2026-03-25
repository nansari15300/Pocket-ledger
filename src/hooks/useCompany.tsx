
"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "./useAuth";
import { doc, onSnapshot, collection, query, where, Timestamp } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import type { PermissionConfig } from "./usePermissions";


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
    password?: string; // Add this line
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
    settings?: Record<string, boolean>;
    allowAttachments?: boolean;
    isDeleted?: boolean; 
    handoverTo?: string | null;
    handoverStatus?: 'pending' | 'accepted' | null;
    handoverInitiatedAt?: Timestamp | null;
    storageOption?: 'firebase' | 'drive';
    /** Enable "Link Payment to Txns" feature (allocate payment to invoices). */
    enableLinkPaymentToTxns?: boolean;
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
};

type CompanyContextType = {
  companyId: string | null;
  company: Company | null;
  allCompanies: Company[];
  loading: boolean;
  triggerSync: () => void; // no-op: kept for API compatibility (offline removed)
  setCompanyId: (companyId: string) => void;
  clearCompanyId: () => void;
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
  const [allCompanies, setAllCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const { user, customUser, loading: authLoading } = useAuth();
  const ownedSnapRef = useRef<any>(null);
  const sharedSnapRef = useRef<any>(null);
  const ownedByEmailSnapRef = useRef<any>(null);
  const isSuperAdmin = customUser?.role === "SuperAdmin";
  const triggerSync = useCallback(() => {}, []);
  // Track mount time to avoid clearing companyId during initial Firestore load (static/Capacitor race)
  const mountedAtRef = useRef<number>(Date.now());
  const hasCheckedStorageRef = useRef(false);

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

  useEffect(() => {
      // During auth bootstrap, avoid clearing persisted company selection.
      if (authLoading) return;
      if (!user) {
          clearCompanyId();
      } else if (customUser?.companyId && !companyId) {
          setCompanyId(customUser.companyId);
      }
  }, [user, customUser, companyId, clearCompanyId, setCompanyId, authLoading]);

  const handleSnapshotUpdate = useCallback(async (ownedSnap: any, sharedSnap: any, ownedByEmailSnap?: any) => {
    const isOwnedByUser = (c: Company) =>
      c.ownerId === user?.uid ||
      (!!c.ownerEmail && !!user?.email && c.ownerEmail.toLowerCase().trim() === user.email!.toLowerCase().trim());
    const owned = ownedSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data(), isOwned: true } as Company)).filter((c: Company) => !c.isDeleted);
    const shared = sharedSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data(), isOwned: false } as Company)).filter((c: Company) => !c.isDeleted);
    const ownedByEmail = ownedByEmailSnap?.docs?.map((doc: any) => ({ id: doc.id, ...doc.data(), isOwned: true } as Company)).filter((c: Company) => !c.isDeleted) ?? [];

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

    setAllCompanies(Array.from(companyMap.values()));
    setLoading(false);
  }, [user?.uid, user?.email]);

  useEffect(() => {
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
    const triggerUpdate = () => {
      if (!ownedSnapRef.current || !sharedSnapRef.current) return;
      if (needsOwnedByEmail && !ownedByEmailSnapRef.current) return;
      handleSnapshotUpdate(ownedSnapRef.current, sharedSnapRef.current, ownedByEmailSnapRef.current ?? undefined);
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

    return () => {
        unsubOwned();
        unsubShared();
        unsubOwnedByEmail();
        ownedSnapRef.current = null;
        sharedSnapRef.current = null;
        ownedByEmailSnapRef.current = null;
    }
}, [user?.email, user?.uid, authLoading, isSuperAdmin, handleSnapshotUpdate]);


  useEffect(() => {
    if (!companyId) {
      setCompany(null);
      // No need to set loading here, allCompanies loading will handle it
      return;
    }
    
    const companyFromList = allCompanies.find(c => c.id === companyId);
    if (companyFromList) {
        setCompany(companyFromList);
    } else if (allCompanies.length > 0) {
        // Grace period: avoid clearing during initial load (static/Capacitor race)
        const graceMs = 2000;
        if (Date.now() - mountedAtRef.current < graceMs) return;
        // If the stored companyId is not in the user's list (e.g., access revoked)
        // clear it and let the logic in dashboard redirect.
        console.log("Company not found in user's list, clearing local state.");
        clearCompanyId();
    }
  }, [companyId, allCompanies, clearCompanyId]);

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

    if (!companyId && user) {
        try {
            const storedCompanyId = localStorage.getItem("companyId");
            const stored = storedCompanyId?.trim();
            if (!stored) {
                // Lamho grace: Next static client transition + localStorage sync (300ms ma pathname purano rahanchha)
                const REDIRECT_DELAY_MS = 900;
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
  }, [companyId, pathname, router, user, authLoading]);

  return (
    <CompanyContext.Provider value={{ companyId, company, loading, triggerSync, setCompanyId, clearCompanyId, allCompanies }}>
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
