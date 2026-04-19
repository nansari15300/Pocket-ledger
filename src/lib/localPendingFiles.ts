"use client";

import { openDB } from "./offlineDb";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { doc, getDoc, updateDoc, type DocumentReference } from "firebase/firestore";
import { storage } from "@/lib/firebase";
import { firestore } from "@/lib/firebase";

const STORE = "pendingFiles";

/** Party/Bank/Staff/Item pending sync ke liye bhi yahi ref (pehle sirf vouchers tha). */
const PENDING_SYNC_COLLECTIONS = new Set(["vouchers", "parties", "bank_accounts", "staff", "items"]);

export function firestoreDocRefFromPath(docPath: string): DocumentReference {
  const p = String(docPath || "").trim().replace(/^\/+|\/+$/g, "");
  const m = /^companies\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(p);
  if (!m || !PENDING_SYNC_COLLECTIONS.has(m[2])) {
    throw new Error(`[localPendingFiles] invalid or unsupported docPath: ${docPath}`);
  }
  return doc(firestore, "companies", m[1], m[2], m[3]);
}

/** `@deprecated` — `firestoreDocRefFromPath` use karo; vouchers ke liye bhi wahi. */
export function voucherDocRefFromPath(docPath: string): DocumentReference {
  return firestoreDocRefFromPath(docPath);
}

export type PendingFilePayload = {
  id: string;
  blob: Blob;
  contentType: string;
  /** Firestore path e.g. companies/xxx/vouchers/yyy */
  docPath: string;
  /** Field to update e.g. fileUrls (array) or attachmentUrl (string) */
  field: string;
  /** For array fields: replace value at this index. Omit for single string field. */
  arrayIndex?: number;
  /** Storage path prefix e.g. voucher-files/companyId/payment_out */
  storagePathPrefix: string;
  fileName?: string;
  createdAt?: number;
};

export function generateLocalFileId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `local_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/** Prefix for URLs that are still in IndexedDB (to be uploaded when online). */
export const LOCAL_FILE_PREFIX = "local:";

export function isLocalFileRef(url: string): boolean {
  return typeof url === "string" && url.startsWith(LOCAL_FILE_PREFIX);
}

/** Preview / open: `local:uuid` → IndexedDB blob (SQLite me sirf string ref store hota hai). */
export async function getBlobFromLocalFileRef(url: string): Promise<Blob | null> {
  if (!isLocalFileRef(url)) return null;
  const localId = url.slice(LOCAL_FILE_PREFIX.length);
  if (!localId) return null;
  const pending = await getPendingFiles();
  const item = pending.find((row) => row.id === localId);
  return item?.blob ?? null;
}

/** Gallery label + FilePreview `resolvedName` — puri pending row (fileName / contentType / blob) */
export async function getPendingPayloadForLocalRef(url: string): Promise<PendingFilePayload | null> {
  if (!isLocalFileRef(url)) return null;
  const localId = url.slice(LOCAL_FILE_PREFIX.length);
  if (!localId) return null;
  const pending = await getPendingFiles();
  return pending.find((row) => row.id === localId) ?? null;
}

export async function uploadPendingLocalFileRef(
  localFileRef: string,
  storagePathPrefix: string
): Promise<string> {
  if (!isLocalFileRef(localFileRef)) return localFileRef;
  const localId = localFileRef.slice(LOCAL_FILE_PREFIX.length);
  if (!localId) return localFileRef;
  const pending = await getPendingFiles();
  const item = pending.find((row) => row.id === localId);
  // If the local payload is missing, keep original ref so caller can retry later without data loss.
  if (!item) return localFileRef;
  // Upload one local file ref and return its final public URL for caller-side payload replacement.
  const storagePath = `${storagePathPrefix}/${Date.now()}_${item.fileName || "file"}`;
  const storageRef = ref(storage, storagePath);
  await uploadBytes(storageRef, item.blob, { contentType: item.contentType || "application/octet-stream" });
  const url = await getDownloadURL(storageRef);
  const docRef = firestoreDocRefFromPath(item.docPath);
  const snap = await getDoc(docRef);
  if (!snap.exists()) {
    throw new Error("Document not found");
  }
  const data = snap.data();
  const current = data[item.field];
  if (Array.isArray(current)) {
    const arr = [...current];
    const idx = arr.findIndex((v) => v === `${LOCAL_FILE_PREFIX}${item.id}`);
    if (idx >= 0) arr[idx] = url;
    else arr.push(url);
    await updateDoc(docRef, { [item.field]: arr });
  } else {
    await updateDoc(docRef, { [item.field]: url });
  }
  await removePendingFile(item.id);
  return url;
}

export async function putPendingFile(payload: PendingFilePayload): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    store.put({ ...payload, createdAt: payload.createdAt ?? Date.now() });
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function getPendingFiles(): Promise<PendingFilePayload[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const req = store.getAll();
    req.onsuccess = () => { db.close(); resolve(req.result || []); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

export async function removePendingFile(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    store.delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/**
 * Upload one pending file to Storage and update Firestore doc; then remove from IndexedDB.
 */
export async function syncOnePendingFile(
  item: PendingFilePayload
): Promise<{ success: boolean; error?: string }> {
  try {
    const storagePath = `${item.storagePathPrefix}/${Date.now()}_${item.fileName || "file"}`;
    const storageRef = ref(storage, storagePath);
    await uploadBytes(storageRef, item.blob, { contentType: item.contentType || "application/octet-stream" });
    const url = await getDownloadURL(storageRef);

    const docRef = firestoreDocRefFromPath(item.docPath);
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      return { success: false, error: "Document not found" };
    }
    const data = snap.data();
    const current = data[item.field];

    if (Array.isArray(current)) {
      const arr = [...current];
      const idx = arr.findIndex((v) => v === `${LOCAL_FILE_PREFIX}${item.id}`);
      if (idx >= 0) arr[idx] = url;
      else arr.push(url);
      await updateDoc(docRef, { [item.field]: arr });
    } else {
      await updateDoc(docRef, { [item.field]: url });
    }

    await removePendingFile(item.id);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || String(e) };
  }
}

/**
 * Sync all pending files to Storage and update Firestore docs. Call when online.
 */
export async function syncPendingFiles(): Promise<{ synced: number; failed: number }> {
  const pending = await getPendingFiles();
  let synced = 0;
  let failed = 0;
  for (const item of pending) {
    const result = await syncOnePendingFile(item);
    if (result.success) synced++;
    else failed++;
  }
  return { synced, failed };
}
