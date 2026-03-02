"use client";

import { openDB } from "./offlineDb";

const STORE = "companies";

export type PendingCompanyPayload = {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  pan?: string;
  country: string;
  password?: string | null;
  logoUrl?: string | null;
  fiscalYearStart?: Date | null;
  fiscalYearEnd?: Date | null;
  ownerId: string;
  ownerEmail?: string;
  createdAt?: number; // local timestamp
};

export async function putPendingCompany(payload: PendingCompanyPayload): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    store.put({ ...payload, createdAt: payload.createdAt ?? Date.now() });
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function getPendingCompanies(): Promise<PendingCompanyPayload[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const req = store.getAll();
    req.onsuccess = () => { db.close(); resolve(req.result || []); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

export async function removePendingCompany(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    store.delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
