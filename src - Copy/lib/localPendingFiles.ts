"use client";

import { openDB } from "./offlineDb";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { storage } from "@/lib/firebase";
import { firestore } from "@/lib/firebase";

const STORE = "pendingFiles";

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

    const pathSegments = item.docPath.split("/").filter(Boolean);
    const docRef = doc(firestore, ...pathSegments);
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
