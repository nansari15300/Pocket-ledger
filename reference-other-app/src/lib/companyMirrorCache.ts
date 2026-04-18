"use client";

import { openDB } from "./offlineDb";

const COMPANY_STORE = "cachedCompanies";
const COLLECTION_STORE = "cachedCompanyCollections";

export const COMPANY_COLLECTION_PATHS = [
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
  "alarms",
] as const;

export type CompanyCollectionPath = (typeof COMPANY_COLLECTION_PATHS)[number];

function toIndexedDbSafe(value: any): any {
  if (Array.isArray(value)) {
    return value.map(toIndexedDbSafe);
  }
  if (value && typeof value === "object") {
    if (typeof value.toDate === "function") {
      return value.toDate();
    }
    const next: Record<string, any> = {};
    Object.entries(value).forEach(([key, child]) => {
      next[key] = toIndexedDbSafe(child);
    });
    return next;
  }
  return value;
}

export async function cacheCompanyDocument(companyId: string, company: any) {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(COMPANY_STORE, "readwrite");
    const store = tx.objectStore(COMPANY_STORE);
    // Persist the selected company doc so refresh while offline can still bootstrap the company context.
    store.put({ id: companyId, company: toIndexedDbSafe(company), updatedAt: Date.now() });
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function getCachedCompanyDocument(companyId: string) {
  const db = await openDB();
  return new Promise<any | null>((resolve, reject) => {
    const tx = db.transaction(COMPANY_STORE, "readonly");
    const store = tx.objectStore(COMPANY_STORE);
    const req = store.get(companyId);
    req.onsuccess = () => {
      db.close();
      resolve(req.result?.company ? { id: companyId, ...req.result.company } : null);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

export async function cacheCompanyCollection(companyId: string, collectionPath: CompanyCollectionPath, data: any[]) {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(COLLECTION_STORE, "readwrite");
    const store = tx.objectStore(COLLECTION_STORE);
    // Cache each raw collection separately so one small update does not rewrite the full company snapshot.
    store.put({
      id: `${companyId}:${collectionPath}`,
      companyId,
      collectionPath,
      data: toIndexedDbSafe(data),
      updatedAt: Date.now(),
    });
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function getCachedCompanyCollections(companyId: string) {
  const db = await openDB();
  return new Promise<Partial<Record<CompanyCollectionPath, any[]>>>((resolve, reject) => {
    const tx = db.transaction(COLLECTION_STORE, "readonly");
    const store = tx.objectStore(COLLECTION_STORE);
    const output: Partial<Record<CompanyCollectionPath, any[]>> = {};
    let remaining = COMPANY_COLLECTION_PATHS.length;

    COMPANY_COLLECTION_PATHS.forEach((collectionPath) => {
      const req = store.get(`${companyId}:${collectionPath}`);
      req.onsuccess = () => {
        if (req.result?.data) {
          output[collectionPath] = req.result.data;
        }
        remaining -= 1;
        if (remaining === 0) {
          db.close();
          resolve(output);
        }
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    });
  });
}
