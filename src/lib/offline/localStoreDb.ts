"use client";

/**
 * IndexedDB for local + online data – EXE/APK built app मा device मा save।
 * Schema: localSchema.ts को LOCAL_TABLES; same shape Firestore जस्तै use गर्न सकिन्छ।
 */

import { LOCAL_TABLES } from "./localSchema";

const DB_NAME = "pocket-ledger-local";
const DB_VERSION = 1;

/** Object stores that need companyId index (query by company). */
const STORES_WITH_COMPANY_INDEX = [
  LOCAL_TABLES.vouchers,
  LOCAL_TABLES.parties,
  LOCAL_TABLES.accounts,
  LOCAL_TABLES.groups,
  LOCAL_TABLES.account_groups,
  LOCAL_TABLES.expense_groups,
  LOCAL_TABLES.staff_groups,
  LOCAL_TABLES.tax_groups,
  LOCAL_TABLES.items,
  LOCAL_TABLES.taxes,
  LOCAL_TABLES.voucher_settings,
] as const;

export function openLocalStoreDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB not available"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      const storeNames = Object.values(LOCAL_TABLES);
      for (const name of storeNames) {
        if (!db.objectStoreNames.contains(name)) {
          const store = db.createObjectStore(name, { keyPath: "id" });
          if (STORES_WITH_COMPANY_INDEX.includes(name as (typeof STORES_WITH_COMPANY_INDEX)[number])) {
            store.createIndex("companyId", "companyId", { unique: false });
          }
        }
      }
    };
  });
}
