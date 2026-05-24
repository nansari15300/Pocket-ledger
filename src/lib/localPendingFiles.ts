"use client";

import { openDB } from "./offlineDb";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { doc, getDoc, type DocumentReference } from "firebase/firestore";
import { storage } from "@/lib/firebase";
import { firestore } from "@/lib/firebase";
import { writeEntity } from "@/lib/writeGateway";
import { Capacitor } from "@capacitor/core";
import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";
import {
  deleteAttachmentBlobFromDataDir,
  getAttachmentFileUriFromDataDir,
  readAttachmentBlobFromDataDir,
  writeAttachmentBlobToDataDir,
} from "@/lib/capacitorAttachmentFs";
import { computeSha256HexFromBlob } from "@/lib/security/sha256Hex";
import {
  deleteAttachmentFileRef,
  getAttachmentFileRef,
  listAttachmentFileRefs,
  upsertAttachmentFileRef,
} from "@/lib/attachmentFileRefStore";
import {
  isGoogleDriveCloudSyncCompany,
  uploadPendingAttachmentPayloadToDrive,
  downloadDriveAttachmentBlob,
} from "@/lib/localCloudSync/driveCloudSyncClient";
import { isDriveFileRef, remotePathFromDriveFileRef } from "@/lib/localCloudSync/pocketLedgerDrivePaths";
import { getLocalCompanyById } from "@/lib/localCompanyStore";

const STORE = "pendingFiles";

/** Forensic: `NEXT_PUBLIC_ATTACHMENT_FORENSIC_DEBUG=1` — pending replace vs append + delete order proof. */
function localPendingFilesForensicEnabled(): boolean {
  return typeof process !== "undefined" && process.env.NEXT_PUBLIC_ATTACHMENT_FORENSIC_DEBUG === "1";
}

/** `companies/{cid}/{col}/{id}` par partial patch — direct `updateDoc` ki jagah write gateway. */
async function patchCompanyDocViaGateway(docRef: DocumentReference, patch: Record<string, unknown>): Promise<void> {
  const m = /^companies\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(docRef.path);
  if (!m) throw new Error(`[localPendingFiles] invalid ref path: ${docRef.path}`);
  const r = await writeEntity({
    companyId: m[1],
    collectionName: m[2],
    docId: m[3],
    operation: "update",
    data: patch,
  });
  if (r.ok === false) throw new Error(r.error);
}

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
    const blob = await readAttachmentBlobFromDataDir(
      row.filePath,
      row.contentType,
      row.sha256Hex ?? undefined
    );
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
  // Direct `get(id)` — `getAll` se zyada reliable + race kam (flush/hydrate hot path).
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const req = store.get(localId.trim());
    req.onsuccess = () => {
      db.close();
      const row = req.result as (PendingFilePayload & { createdAt?: number }) | undefined;
      if (!row?.blob) {
        resolve(null);
        return;
      }
      const blob = row.blob;
      if (!(blob instanceof Blob) || blob.size <= 0) {
        resolve(null);
        return;
      }
      resolve({
        id: row.id,
        blob,
        contentType: row.contentType || blob.type || "application/octet-stream",
        docPath: row.docPath,
        field: row.field,
        arrayIndex: row.arrayIndex,
        storagePathPrefix: row.storagePathPrefix,
        fileName: row.fileName,
        createdAt: row.createdAt,
      });
    };
    req.onerror = () => {
      try {
        db.close();
      } catch {
        /* ignore */
      }
      reject(req.error);
    };
  });
}

/** Preview / open: `local:uuid` → blob (Capacitor: DataDirectory file, web/electron: IndexedDB). */
export async function getBlobFromLocalFileRef(
  url: string,
  options?: LocalFileReadOptions
): Promise<Blob | null> {
  if (isDriveFileRef(url)) {
    const remotePath = remotePathFromDriveFileRef(url);
    if (!remotePath) return null;
    try {
      return await downloadDriveAttachmentBlob(remotePath);
    } catch {
      return null;
    }
  }
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

  const docMatch = /^companies\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(String(item.docPath || "").trim());
  if (docMatch && (await isGoogleDriveCloudSyncCompany(docMatch[1]!))) {
    const reg = await getLocalCompanyById(docMatch[1]!, { includeDeleted: true });
    const driveRef = await uploadPendingAttachmentPayloadToDrive({
      companyId: docMatch[1]!,
      companyName: reg?.name,
      company: reg,
      collection: docMatch[2]!,
      docId: docMatch[3]!,
      blob: item.blob,
      contentType: item.contentType,
      fileName: item.fileName,
    });
    const docRef = firestoreDocRefFromPath(item.docPath);
    const snap = await getDoc(docRef);
    if (!snap.exists()) throw new Error("Document not found");
    const data = snap.data();
    const current = data[item.field];
    if (Array.isArray(current)) {
      const arr = [...current];
      const needle = `${LOCAL_FILE_PREFIX}${item.id}`;
      const idx = arr.findIndex((v) => v === needle);
      if (idx >= 0) arr[idx] = driveRef;
      else arr.push(driveRef);
      await patchCompanyDocViaGateway(docRef, { [item.field]: arr });
    } else {
      await patchCompanyDocViaGateway(docRef, { [item.field]: driveRef });
    }
    await removePendingFile(item.id);
    return driveRef;
  }

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
    const needle = `${LOCAL_FILE_PREFIX}${item.id}`;
    const idx = arr.findIndex((v) => v === needle);
    const oldArraySnapshot = [...arr];
    const action: "replace_at_index" | "append_unmatched" =
      idx >= 0 ? "replace_at_index" : "append_unmatched";
    if (idx >= 0) arr[idx] = url;
    else arr.push(url);
    if (localPendingFilesForensicEnabled()) {
      console.warn("[FORENSIC_PENDING_UPLOAD]", {
        phase: "uploadPendingLocalFileRef",
        localId: item.id,
        needleMatched: needle,
        matchedIndex: idx,
        action,
        oldArray: oldArraySnapshot,
        newArray: arr,
        note: "STEP_FIRESTORE_PATCH_NEXT_then_removePendingFile_after_await",
        navigatorOnLine: typeof navigator !== "undefined" ? navigator.onLine : undefined,
      });
    }
    await patchCompanyDocViaGateway(docRef, { [item.field]: arr });
  } else {
    if (localPendingFilesForensicEnabled()) {
      console.warn("[FORENSIC_PENDING_UPLOAD]", {
        phase: "uploadPendingLocalFileRef",
        localId: item.id,
        field: item.field,
        action: "scalar_field_replace",
        oldValue: current,
        newValue: url,
        note: "STEP_FIRESTORE_PATCH_NEXT_then_removePendingFile_after_await",
      });
    }
    await patchCompanyDocViaGateway(docRef, { [item.field]: url });
  }
  if (localPendingFilesForensicEnabled()) {
    console.warn("[FORENSIC_PENDING_UPLOAD]", {
      phase: "uploadPendingLocalFileRef",
      localId: item.id,
      step: "AFTER_GATEWAY_PATCH_BEFORE_PENDING_DELETE",
      pendingBytesStillPresentUntilRemovePendingFile: true,
    });
  }
  await removePendingFile(item.id);
  if (localPendingFilesForensicEnabled()) {
    console.warn("[FORENSIC_PENDING_UPLOAD]", {
      phase: "uploadPendingLocalFileRef",
      localId: item.id,
      step: "AFTER_REMOVE_PENDING_FILE_COMPLETE",
      pendingBytesDeleted: true,
    });
  }
  return url;
}

export async function putPendingFile(payload: PendingFilePayload): Promise<void> {
  const createdAt = payload.createdAt ?? Date.now();
  if (isCapacitorNativeApp()) {
    // Capacitor/mobile: bytes ko DataDirectory me rakho, SQLite me path/meta row.
    const path = pendingFileDataDirPath(payload.id, payload.fileName);
    const ok = await writeAttachmentBlobToDataDir(path, payload.blob);
    if (!ok) throw new Error("Failed to persist pending attachment in DataDirectory");
    const sha256Hex = await computeSha256HexFromBlob(payload.blob);
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
      sha256Hex,
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
    const row = { ...payload, createdAt };
    store.put(row);
    tx.oncomplete = () => {
      db.close();
      // Web preview: `getLocalFileRefMetaSync` / UI — native `putPendingFile` jaisa runtime cache seed (IDB ke alawa fast path).
      setLocalFileRefMetaCache({
        id: payload.id,
        contentType: payload.contentType || payload.blob.type || "application/octet-stream",
        fileName: payload.fileName,
        size: payload.blob.size || 0,
        createdAt,
        docPath: payload.docPath,
        field: payload.field,
        storagePathPrefix: payload.storagePathPrefix,
      });
      resolve();
    };
    tx.onerror = () => {
      try {
        db.close();
      } catch {
        /* ignore */
      }
      reject(tx.error);
    };
  });
}

export async function getPendingFiles(): Promise<PendingFilePayload[]> {
  if (isCapacitorNativeApp()) {
    const rows = await listAttachmentFileRefs("pending_file");
    const out: PendingFilePayload[] = [];
    for (const row of rows) {
      const meta = parsePendingMeta(row.metaJson);
      if (!meta) continue;
      const blob = await readAttachmentBlobFromDataDir(
        row.filePath,
        row.contentType,
        row.sha256Hex ?? undefined
      );
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
  if (localPendingFilesForensicEnabled()) {
    console.warn("[FORENSIC_PENDING_REMOVE]", {
      phase: "removePendingFile_start",
      localId: id,
      note: "pending_bytes_deleted_here_SQLite_mirror_update_is_separate_async",
      navigatorOnLine: typeof navigator !== "undefined" ? navigator.onLine : undefined,
    });
  }
  if (isCapacitorNativeApp()) {
    const row = await getAttachmentFileRef("pending_file", id);
    if (row?.filePath) await deleteAttachmentBlobFromDataDir(row.filePath);
    await deleteAttachmentFileRef("pending_file", id);
    // Delete ke baad stale URI reuse na ho.
    localFileRefMetaRuntimeCache.delete(id);
    if (localPendingFilesForensicEnabled()) {
      console.warn("[FORENSIC_PENDING_REMOVE]", {
        phase: "removePendingFile_done_native",
        localId: id,
        hadFilePath: Boolean(row?.filePath),
      });
    }
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
  if (localPendingFilesForensicEnabled()) {
    console.warn("[FORENSIC_PENDING_REMOVE]", { phase: "removePendingFile_done_indexeddb", localId: id });
  }
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
      const needle = `${LOCAL_FILE_PREFIX}${item.id}`;
      const idx = arr.findIndex((v) => v === needle);
      const oldArraySnapshot = [...arr];
      const action: "replace_at_index" | "append_unmatched" =
        idx >= 0 ? "replace_at_index" : "append_unmatched";
      if (idx >= 0) arr[idx] = url;
      else arr.push(url);
      if (localPendingFilesForensicEnabled()) {
        console.warn("[FORENSIC_PENDING_SYNC_ONE]", {
          phase: "syncOnePendingFile",
          localId: item.id,
          needleMatched: needle,
          matchedIndex: idx,
          action,
          oldArray: oldArraySnapshot,
          newArray: arr,
          note: "STEP_FIRESTORE_PATCH_NEXT_then_removePendingFile_after_await",
          navigatorOnLine: typeof navigator !== "undefined" ? navigator.onLine : undefined,
        });
      }
      await patchCompanyDocViaGateway(docRef, { [item.field]: arr });
    } else {
      if (localPendingFilesForensicEnabled()) {
        console.warn("[FORENSIC_PENDING_SYNC_ONE]", {
          phase: "syncOnePendingFile",
          localId: item.id,
          field: item.field,
          action: "scalar_field_replace",
          oldValue: current,
          newValue: url,
          note: "STEP_FIRESTORE_PATCH_NEXT_then_removePendingFile_after_await",
        });
      }
      await patchCompanyDocViaGateway(docRef, { [item.field]: url });
    }

    if (localPendingFilesForensicEnabled()) {
      console.warn("[FORENSIC_PENDING_SYNC_ONE]", {
        phase: "syncOnePendingFile",
        localId: item.id,
        step: "AFTER_GATEWAY_PATCH_BEFORE_PENDING_DELETE",
        pendingBytesStillPresentUntilRemovePendingFile: true,
      });
    }
    await removePendingFile(item.id);
    if (localPendingFilesForensicEnabled()) {
      console.warn("[FORENSIC_PENDING_SYNC_ONE]", {
        phase: "syncOnePendingFile",
        localId: item.id,
        step: "AFTER_REMOVE_PENDING_FILE_COMPLETE",
        pendingBytesDeleted: true,
        success: true,
      });
    }
    return { success: true };
  } catch (e: any) {
    if (localPendingFilesForensicEnabled()) {
      console.warn("[FORENSIC_PENDING_SYNC_ONE]", {
        phase: "syncOnePendingFile",
        localId: item.id,
        success: false,
        error: e?.message || String(e),
      });
    }
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
