"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { usePathname } from "next/navigation";
import { firestore } from "@/lib/firebase";
import { useCompany } from "@/hooks/useCompany";
import { isCloudBackedCompanyShape } from "@/lib/offlineFullWarmSync";
import { pullCompanyDocFromFirestoreToLocalDb } from "@/lib/firestoreToLocalCompanyPull";
import {
  FIREBASE_LEDGER_SYNC_MODE_CHANGED_EVENT,
} from "@/lib/firebaseLedgerSyncMode";
import {
  FIREBASE_LEDGER_DATA_SYNC_CHANGED_EVENT,
  FIREBASE_LEDGER_DATA_SYNC_STORAGE_KEY,
} from "@/lib/firebaseLedgerDataSyncDisabled";
import {
  FIREBASE_LEDGER_COMPANY_SYNC_PREFS_CHANGED_EVENT,
  isFirebaseLedgerCompanyDataSyncEnabled,
} from "@/lib/firebaseLedgerCompanySyncPrefs";
import {
  shouldBindFirebaseLedgerChangeFeed,
} from "@/lib/firebaseLedgerSyncPolicy";
import { notifyBrowserDbCollectionUpdated } from "@/lib/localCompanyDocMirror";

const VOUCHER_FORM_MASTER_COLLECTION_PATHS = new Set([
  "vouchers",
  "parties",
  "staff",
  "bank_accounts",
  "taxes",
  "expense_accounts",
  "items",
  "item_groups",
  "groups",
  "account_groups",
  "staff_groups",
  "tax_groups",
  "expense_groups",
]);

function activeDeltaCollectionsForRoute(pathname: string): Set<string> {
  const route = String(pathname || "").trim().toLowerCase();
  if (route.startsWith("/bank-cash")) return new Set(["vouchers", "bank_accounts", "account_groups"]);
  if (route.startsWith("/party")) return new Set(["vouchers", "parties", "groups", "expense_accounts"]);
  if (route.startsWith("/staff")) return new Set(["vouchers", "staff", "staff_groups"]);
  if (route.startsWith("/loans")) return new Set(["vouchers", "staff", "staff_groups", "bank_accounts", "account_groups", "expense_accounts", "expense_groups", "loans", "loan_schedules", "loan_transactions", "loan_rate_history", "loan_charges", "loan_audit_logs", "loan_settings", "loan_documents"]);
  if (route.startsWith("/tax")) return new Set(["vouchers", "taxes", "tax_groups"]);
  if (route.startsWith("/items")) return new Set(["vouchers", "items", "item_groups"]);
  if (route.startsWith("/incomes")) return new Set(["vouchers", "expense_accounts", "expense_groups"]);
  if (route.startsWith("/company") || route.startsWith("/admin") || route === "/" || route === "") {
    return new Set();
  }
  return VOUCHER_FORM_MASTER_COLLECTION_PATHS;
}

export function FirebaseLedgerDeltaSyncManager() {
  const pathname = usePathname() || "";
  const { companyId, company } = useCompany();
  const [policyTick, setPolicyTick] = useState(0);
  const policyDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seenChangeIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const bumpNow = () => setPolicyTick((n) => n + 1);
    const bumpDebounced = () => {
      if (policyDebounceRef.current) clearTimeout(policyDebounceRef.current);
      policyDebounceRef.current = setTimeout(() => {
        policyDebounceRef.current = null;
        bumpNow();
      }, 220);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === FIREBASE_LEDGER_DATA_SYNC_STORAGE_KEY) bumpDebounced();
    };
    window.addEventListener(FIREBASE_LEDGER_SYNC_MODE_CHANGED_EVENT, bumpNow);
    window.addEventListener(FIREBASE_LEDGER_DATA_SYNC_CHANGED_EVENT, bumpDebounced);
    window.addEventListener(FIREBASE_LEDGER_COMPANY_SYNC_PREFS_CHANGED_EVENT, bumpDebounced);
    window.addEventListener("storage", onStorage);
    return () => {
      if (policyDebounceRef.current) clearTimeout(policyDebounceRef.current);
      policyDebounceRef.current = null;
      window.removeEventListener(FIREBASE_LEDGER_SYNC_MODE_CHANGED_EVENT, bumpNow);
      window.removeEventListener(FIREBASE_LEDGER_DATA_SYNC_CHANGED_EVENT, bumpDebounced);
      window.removeEventListener(FIREBASE_LEDGER_COMPANY_SYNC_PREFS_CHANGED_EVENT, bumpDebounced);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const activeCollections = useMemo(() => activeDeltaCollectionsForRoute(pathname), [pathname]);

  useEffect(() => {
    // Single live feed in deltaa — no collection onSnapshot (web/EXE/APK/iOS).
    if (!shouldBindFirebaseLedgerChangeFeed()) return;
    if (!isFirebaseLedgerCompanyDataSyncEnabled(companyId)) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    if (!companyId?.trim() || !company || !isCloudBackedCompanyShape(company)) return;
    if (activeCollections.size === 0) return;

    const localCompanyId = companyId.trim();
    const fsCompanyId = String(
      (company as { authoritativeCompanyId?: string }).authoritativeCompanyId || localCompanyId
    ).trim();
    if (!fsCompanyId) return;

    const q = query(
      collection(firestore, `companies/${fsCompanyId}/_pl_change_log`),
      orderBy("at", "desc"),
      limit(20)
    );

    return onSnapshot(
      q,
      (snap) => {
        for (const change of snap.docChanges()) {
          const changeId = change.doc.id;
          if (seenChangeIdsRef.current.has(changeId)) continue;
          seenChangeIdsRef.current.add(changeId);
          if (seenChangeIdsRef.current.size > 300) {
            seenChangeIdsRef.current = new Set([...seenChangeIdsRef.current].slice(-150));
          }
          const data = change.doc.data() as {
            collectionName?: unknown;
            docId?: unknown;
            op?: unknown;
          };
          const collectionName = String(data.collectionName || "").trim();
          const docId = String(data.docId || "").trim();
          if (!collectionName || !docId || !activeCollections.has(collectionName)) continue;
          void pullCompanyDocFromFirestoreToLocalDb(
            fsCompanyId,
            localCompanyId,
            collectionName,
            docId,
            company,
            { op: String(data.op || "") }
          )
            .then(() => {
              notifyBrowserDbCollectionUpdated(localCompanyId, collectionName, {
                immediate: true,
                source: "firebase_delta_pull",
              });
            })
            .catch((e) => {
              if (process.env.NODE_ENV !== "production") {
                console.warn("[FirebaseLedgerDeltaSyncManager] delta pull failed", {
                  collectionName,
                  docId,
                  error: e instanceof Error ? e.message : String(e),
                });
              }
            });
        }
      },
      (error) => {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[FirebaseLedgerDeltaSyncManager] change feed listener failed", error);
        }
      }
    );
  }, [activeCollections, company, companyId, policyTick]);

  return null;
}
