"use client";

import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";
import { getBrowserIndexedDbHostScope } from "@/lib/localSqlite";
import { PENDING_AUTHORITATIVE_COMPANY_DOC_STORE } from "@/lib/plServerAuthoritativePendingTypes";

/** Shared IndexedDB for offline data (companies, pending files). */
const BASE_DB_NAME = "pocket-ledger-pending";
// Browser me pehle se zyada version ho to `open(..., 2)` fail: "requested version < existing".
// Purane builds ne 8 tak bump kiya — v9 `offlineAttachmentBlobs`: warm-sync attachment bytes cache.
const DB_VERSION = 10;

/** Warm/preview dono isi naam se `openDB` kholte hain — forensic SAVE vs READ grep + drift guard. */
export function getPendingIndexedDbFullName(): string {
  const hostScope = typeof window === "undefined" ? "default" : getBrowserIndexedDbHostScope();
  return `${BASE_DB_NAME}__${hostScope}`;
}

/** Forensic: pending-IDB open par namespace + stores proof (`NEXT_PUBLIC_ATTACHMENT_FORENSIC_DEBUG=1`). */
function pendingIdbForensicEnabled(): boolean {
  return typeof process !== "undefined" && process.env.NEXT_PUBLIC_ATTACHMENT_FORENSIC_DEBUG === "1";
}

export function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB not available"));
      return;
    }
    // `localSqlite.getBrowserIndexedDbHostScope` se align — pehle yahan alag Electron rule tha (SQLite vs pending split risk).
    const dbName = getPendingIndexedDbFullName();
    const hostScope = typeof window === "undefined" ? "default" : getBrowserIndexedDbHostScope();
    // Host-scoped pending DB prevents localhost/prod pending queues from mixing.
    const req = indexedDB.open(dbName, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      if (pendingIdbForensicEnabled()) {
        console.warn("[FORENSIC_DB_OPEN]", {
          kind: "pocket-ledger-pending",
          dbName,
          hostScope,
          idbVersion: db.version,
          objectStoreNames: Array.from(db.objectStoreNames),
          isCapacitorNativeApp: isCapacitorNativeApp(),
          hostname: typeof window !== "undefined" ? window.location.hostname : null,
          port: typeof window !== "undefined" ? window.location.port : null,
          uaHasElectron:
            typeof navigator !== "undefined" && navigator.userAgent.toLowerCase().includes("electron"),
        });
      }
      resolve(db);
    };
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
        /** HTTPS attachment blobs — online full warm → offline preview */
        "offlineAttachmentBlobs",
      ] as const;
      for (const name of storesWithIdKey) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: "id" });
        }
      }
      if (!db.objectStoreNames.contains(PENDING_AUTHORITATIVE_COMPANY_DOC_STORE)) {
        const store = db.createObjectStore(PENDING_AUTHORITATIVE_COMPANY_DOC_STORE, {
          keyPath: "queueItemId",
        });
        store.createIndex("byCoalesceKey", "coalesceKey", { unique: true });
        store.createIndex("byCreatedAt", "createdAt", { unique: false });
        store.createIndex("byState", "state", { unique: false });
      }
      if (pendingIdbForensicEnabled()) {
        console.warn("[FORENSIC_DB_OPEN_UPGRADE]", {
          kind: "pocket-ledger-pending",
          dbName,
          hostScope,
          oldVersion: e.oldVersion,
          newVersion: e.newVersion,
          objectStoreNamesAfter: Array.from(db.objectStoreNames),
        });
      }
    };
  });
}
