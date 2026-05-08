"use client";

import { openDB } from "./offlineDb";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { doc, getDoc, updateDoc, type DocumentReference } from "firebase/firestore";
import { storage } from "@/lib/firebase";
import { firestore } from "@/lib/firebase";
import { Capacitor } from "@capacitor/core";
import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";
import {
  deleteAttachmentBlobFromDataDir,
  getAttachmentFileUriFromDataDir,
  readAttachmentBlobFromDataDir,
  writeAttachmentBlobToDataDir,
} from "@/lib/capacitorAttachmentFs";
import {
  deleteAttachmentFileRef,
  getAttachmentFileRef,
  listAttachmentFileRefs,
  upsertAttachmentFileRef,
} from "@/lib/attachmentFileRefStore";

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

type PendingFileMeta = {
  docPath: string;
  field: string;
  arrayIndex?: number;
  storagePathPrefix: string;
  fileName?: string;
  createdAt: number;
};

export type LocalFileRefMeta = {
  id: string;
  contentType: string | null;
  fileName?: string;
  filePath?: string;
  fileUri?: string;
  displayUrl?: string;
  size: number;
  createdAt?: number;
  docPath?: string;
  field?: string;
  storagePathPrefix?: string;
};

/** Runtime hot-cache: render/open fast-path ke liye `local:uuid` metadata sync milta rahe. */
const localFileRefMetaRuntimeCache = new Map<string, LocalFileRefMeta>();

export function generateLocalFileId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `local_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/** Prefix for URLs that are still in IndexedDB (to be uploaded when online). */
export const LOCAL_FILE_PREFIX = "local:";

export function isLocalFileRef(url: string): boolean {
  return typeof url === "string" && url.startsWith(LOCAL_FILE_PREFIX);
}

/** Sync lookup: render phase me Promise wait avoid karne ke liye. */
export function getLocalFileRefMetaSync(url: string): LocalFileRefMeta | null {
  if (!isLocalFileRef(url)) return null;
  const localId = url.slice(LOCAL_FILE_PREFIX.length);
  if (!localId) return null;
  return localFileRefMetaRuntimeCache.get(localId) ?? null;
}

/** Shared cache upsert helper taaki preview/open dono same resolved path use karein. */
function setLocalFileRefMetaCache(meta: LocalFileRefMeta | null): void {
  if (!meta?.id) return;
  localFileRefMetaRuntimeCache.set(meta.id, meta);
}

/** App boot warm-up: native pending refs ko runtime cache me preload karo taaki `getLocalFileRefMetaSync` hit mile. */
export async function primeLocalFileRefMetaRuntimeCache(): Promise<void> {
  if (!isCapacitorNativeApp()) return;
  try {
    const rows = await listAttachmentFileRefs("pending_file");
    for (const row of rows) {
      if (!row?.id) continue;
      const meta = parsePendingMeta(row.metaJson);
      const fileUri = row.filePath ? await getAttachmentFileUriFromDataDir(row.filePath) : null;
      const displayUrl =
        fileUri && typeof fileUri === "string" ? Capacitor.convertFileSrc(fileUri) : undefined;
      setLocalFileRefMetaCache({
        id: row.id,
        contentType: row.contentType ?? null,
        fileName: meta?.fileName,
        filePath: row.filePath,
        fileUri: fileUri ?? undefined,
        displayUrl,
        size: Number(row.size || 0),
        createdAt: meta?.createdAt,
        docPath: meta?.docPath,
        field: meta?.field,
        storagePathPrefix: meta?.storagePathPrefix,
      });
    }
  } catch {
    /* cache prime best-effort */
  }
}

/** Capacitor DataDirectory path — SQLite me isi string ka reference store hota hai (blob नहीं). */
function pendingFileDataDirPath(id: string, fileName?: string): string {
  const extRaw = String(fileName || "").split(".").pop()?.trim().toLowerCase() || "bin";
  const ext = /^[a-z0-9]{1,10}$/.test(extRaw) ? extRaw : "bin";
  return `attachments/pending/${id}.${ext}`;
}

function parsePendingMeta(metaJson: string | null): PendingFileMeta | null {
  if (!metaJson) return null;
  try {
    const parsed = JSON.parse(metaJson) as Partial<PendingFileMeta>;
    if (!parsed || !parsed.docPath || !parsed.field || !parsed.storagePathPrefix) return null;
    return {
      docPath: String(parsed.docPath),
      field: String(parsed.field),
      arrayIndex:
        typeof parsed.arrayIndex === "number" && Number.isFinite(parsed.arrayIndex)
          ? parsed.arrayIndex
          : undefined,
      storagePathPrefix: String(parsed.storagePathPrefix),
      fileName: parsed.fileName ? String(parsed.fileName) : undefined,
      createdAt:
        typeof parsed.createdAt === "number" && Number.isFinite(parsed.createdAt)
          ? parsed.createdAt
          : Date.now(),
    };
  } catch {
    return null;
  }
}

/** Lightweight metadata lookup: preview/open path ko Blob read ke bina local path/uri mile. */
export async function getLocalFileRefMeta(url: string): Promise<LocalFileRefMeta | null> {
  if (!isLocalFileRef(url)) return null;
  const localId = url.slice(LOCAL_FILE_PREFIX.length);
  if (!localId) return null;
  const cached = localFileRefMetaRuntimeCache.get(localId);
  if (cached) return cached;
  if (isCapacitorNativeApp()) {
    const row = await getAttachmentFileRef("pending_file", localId);
    if (!row) return null;
    const meta = parsePendingMeta(row.metaJson);
    const fileUri = row.filePath ? await getAttachmentFileUriFromDataDir(row.filePath) : null;
    const displayUrl =
      fileUri && typeof fileUri === "string" ? Capacitor.convertFileSrc(fileUri) : undefined;
    const mapped: LocalFileRefMeta = {
      id: localId,
      contentType: row.contentType ?? null,
      fileName: meta?.fileName,
      filePath: row.filePath,
      fileUri: fileUri ?? undefined,
      displayUrl,
      size: Number(row.size || 0),
      createdAt: meta?.createdAt,
      docPath: meta?.docPath,
      field: meta?.field,
      storagePathPrefix: meta?.storagePathPrefix,
    };
    setLocalFileRefMetaCache(mapped);
    return mapped;
  }
  const pending = await getPendingFiles();
  const row = pending.find((p) => p.id === localId);
  if (!row) return null;
  const mapped: LocalFileRefMeta = {
    id: localId,
    contentType: row.contentType || row.blob?.type || null,
    fileName: row.fileName,
    size: row.blob?.size || 0,
    createdAt: row.createdAt,
    docPath: row.docPath,
    field: row.field,
    storagePathPrefix: row.storagePathPrefix,
  };
  setLocalFileRefMetaCache(mapped);
  return mapped;
}

type LocalFileReadOptions = {
  /**
   * Preview pipeline guard: native me `Filesystem.readFile` slow JS bridge path avoid karna hai.
   * Isko false karo to native read attempt par hard-fail throw hoga.
   */
  allowNativeRead?: boolean;
  /** Error diagnostics: kis context se read attempt aaya. */
  context?: string;
};

/** Hot path helper: local:uuid open/preview ke liye full list read avoid. */
async function getPendingFileById(
  localId: string,
  options?: LocalFileReadOptions
): Promise<PendingFilePayload | null> {
  if (!localId?.trim()) return null;
  if (isCapacitorNativeApp()) {
    if (options?.allowNativeRead === false) {
      throw new Error(
        `[localPendingFiles] Native read blocked for context=${options?.context || "unknown"}; expected convertFileSrc fast path`
      );
    }
    const row = await getAttachmentFileRef("pending_file", localId);
    if (!row) return null;
    const meta = parsePendingMeta(row.metaJson);
    if (!meta) return null;
    const blob = await readAttachmentBlobFromDataDir(row.filePath, row.contentType);
    if (!blob || blob.size <= 0) return null;
    return {
      id: localId,
      blob,
      contentType: row.contentType || blob.type || "application/octet-stream",
      docPath: meta.docPath,
      field: meta.field,
      arrayIndex: meta.arrayIndex,
      storagePathPrefix: meta.storagePathPrefix,
      fileName: meta.fileName,
      createdAt: meta.createdAt,
    };
  }
  const pending = await getPendingFiles();
  return pending.find((row) => row.id === localId) ?? null;
}

/** Preview / open: `local:uuid` → blob (Capacitor: DataDirectory file, web/electron: IndexedDB). */
export async function getBlobFromLocalFileRef(
  url: string,
  options?: LocalFileReadOptions
): Promise<Blob | null> {
  if (!isLocalFileRef(url)) return null;
  const localId = url.slice(LOCAL_FILE_PREFIX.length);
  if (!localId) return null;
  const item = await getPendingFileById(localId, options);
  return item?.blob ?? null;
}

/** Gallery label + FilePreview `resolvedName` — puri pending row (fileName / contentType / blob) */
export async function getPendingPayloadForLocalRef(url: string): Promise<PendingFilePayload | null> {
  if (!isLocalFileRef(url)) return null;
  const localId = url.slice(LOCAL_FILE_PREFIX.length);
  if (!localId) return null;
  return await getPendingFileById(localId);
}

export async function uploadPendingLocalFileRef(
  localFileRef: string,
  storagePathPrefix: string
): Promise<string> {
  if (!isLocalFileRef(localFileRef)) return localFileRef;
  const localId = localFileRef.slice(LOCAL_FILE_PREFIX.length);
  if (!localId) return localFileRef;
  const item = await getPendingFileById(localId);
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
  const createdAt = payload.createdAt ?? Date.now();
  if (isCapacitorNativeApp()) {
    // Capacitor/mobile: bytes ko DataDirectory me rakho, SQLite me path/meta row.
    const path = pendingFileDataDirPath(payload.id, payload.fileName);
    const ok = await writeAttachmentBlobToDataDir(path, payload.blob);
    if (!ok) throw new Error("Failed to persist pending attachment in DataDirectory");
    const meta: PendingFileMeta = {
      docPath: payload.docPath,
      field: payload.field,
      arrayIndex: payload.arrayIndex,
      storagePathPrefix: payload.storagePathPrefix,
      fileName: payload.fileName,
      createdAt,
    };
    await upsertAttachmentFileRef({
      scope: "pending_file",
      id: payload.id,
      filePath: path,
      contentType: payload.contentType || payload.blob.type || "application/octet-stream",
      size: payload.blob.size || 0,
      metaJson: JSON.stringify(meta),
      updatedAt: createdAt,
    });
    // Freshly persisted local file: sync render/open fast-path ke liye runtime cache seed karo.
    const fileUri = await getAttachmentFileUriFromDataDir(path);
    setLocalFileRefMetaCache({
      id: payload.id,
      contentType: payload.contentType || payload.blob.type || "application/octet-stream",
      fileName: payload.fileName,
      filePath: path,
      fileUri: fileUri ?? undefined,
      displayUrl: fileUri ? Capacitor.convertFileSrc(fileUri) : undefined,
      size: payload.blob.size || 0,
      createdAt,
      docPath: payload.docPath,
      field: payload.field,
      storagePathPrefix: payload.storagePathPrefix,
    });
    return;
  }
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    store.put({ ...payload, createdAt });
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function getPendingFiles(): Promise<PendingFilePayload[]> {
  if (isCapacitorNativeApp()) {
    const rows = await listAttachmentFileRefs("pending_file");
    const out: PendingFilePayload[] = [];
    for (const row of rows) {
      const meta = parsePendingMeta(row.metaJson);
      if (!meta) continue;
      const blob = await readAttachmentBlobFromDataDir(row.filePath, row.contentType);
      if (!blob || blob.size <= 0) continue;
      out.push({
        id: row.id,
        blob,
        contentType: row.contentType || blob.type || "application/octet-stream",
        docPath: meta.docPath,
        field: meta.field,
        arrayIndex: meta.arrayIndex,
        storagePathPrefix: meta.storagePathPrefix,
        fileName: meta.fileName,
        createdAt: meta.createdAt,
      });
    }
    return out;
  }
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
  if (isCapacitorNativeApp()) {
    const row = await getAttachmentFileRef("pending_file", id);
    if (row?.filePath) await deleteAttachmentBlobFromDataDir(row.filePath);
    await deleteAttachmentFileRef("pending_file", id);
    // Delete ke baad stale URI reuse na ho.
    localFileRefMetaRuntimeCache.delete(id);
    return;
  }
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    store.delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
  // Web/electron path me bhi stale cache clean.
  localFileRefMetaRuntimeCache.delete(id);
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
