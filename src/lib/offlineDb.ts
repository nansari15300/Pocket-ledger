"use client";

import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";

/** Shared IndexedDB for offline data (companies, pending files). */
const BASE_DB_NAME = "pocket-ledger-pending";
// Browser me pehle se zyada version ho to `open(..., 2)` fail: "requested version < existing".
// Purane builds ne 8 tak bump kiya — v9 `offlineAttachmentBlobs`: warm-sync attachment bytes cache.
const DB_VERSION = 9;

export function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB not available"));
      return;
    }
    const hostScope =
      typeof window === "undefined"
        ? "default"
        : isCapacitorNativeApp()
        ? // Native/app shell: port change ke baad bhi same IndexedDB naam chahiye, warna attachment cache restart pe "missing" dikhega.
          "capacitor_native_embedded"
        : (() => {
            const ua = (typeof navigator !== "undefined" ? navigator.userAgent : "").toLowerCase();
            if (ua.includes("electron")) {
              // Electron shell me host/port drift (localhost vs 127.0.0.1, random port) par cache split na ho.
              return "electron_embedded";
            }
            return `${window.location.hostname || "unknown"}${window.location.port ? `-${window.location.port}` : ""}`
              .replace(/[^a-zA-Z0-9_.-]/g, "_")
              .toLowerCase();
          })();
    // Host-scoped pending DB prevents localhost/prod pending queues from mixing.
    const req = indexedDB.open(`${BASE_DB_NAME}__${hostScope}`, DB_VERSION);
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
        /** HTTPS attachment blobs — online full warm → offline preview */
        "offlineAttachmentBlobs",
      ] as const;
      for (const name of storesWithIdKey) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: "id" });
        }
      }
    };
  });
}
