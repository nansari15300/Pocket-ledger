"use client";

/** Shared IndexedDB for offline data (companies, pending files). */
const DB_NAME = "pocket-ledger-pending";
// Browser me pehle se zyada version ho to `open(..., 2)` fail: "requested version < existing".
// Purane builds ne 7 tak bump kiya tha — yahan kabhi isse neeche mat karo.
const DB_VERSION = 8;

export function openDB(): Promise<IDBDatabase> {
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
      // Sabhi `openDB()` consumers ke stores — nayi install / purane version se upgrade dono.
      const storesWithIdKey = [
        "companies",
        "pendingFiles",
        "pendingVoucherMutations",
        "pendingRecycleBinMutations",
        "pendingMasterMutations",
        "pendingMasterIdMappings",
        "cachedCompanies",
        "cachedCompanyCollections",
      ] as const;
      for (const name of storesWithIdKey) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: "id" });
        }
      }
    };
  });
}
