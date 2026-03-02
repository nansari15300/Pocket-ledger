"use client";

/** Shared IndexedDB for offline data (companies, pending files). */
const DB_NAME = "pocket-ledger-pending";
const DB_VERSION = 2;

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
      if (!db.objectStoreNames.contains("companies")) {
        db.createObjectStore("companies", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("pendingFiles")) {
        db.createObjectStore("pendingFiles", { keyPath: "id" });
      }
    };
  });
}
