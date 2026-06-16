"use client";

import { openDB } from "./offlineDb";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { doc, getDoc, type DocumentReference } from "firebase/firestore";
import { storage } from "@/lib/firebase";
import { firestore } from "@/lib/firebase";
import { writeEntity } from "@/lib/writeGateway";
import { Capacitor } from "@capacitor/core";
import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";
import { electronAttachmentDisplayUrlFromPath } from "@/lib/electronAttachmentFs";
import { usesEmbeddedNativeAttachmentStorage } from "@/lib/usesEmbeddedNativeAttachmentStorage";
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
  downloadCloudAttachmentBlob,
} from "@/lib/localCloudSync/driveCloudSyncClient";
import { isDriveFileRef, remotePathFromDriveFileRef } from "@/lib/localCloudSync/pocketLedgerDrivePaths";
import type { CloudSyncProviderId } from "@/lib/localCloudSync/types";
import { getLocalCompanyById, listLocalCompanies } from "@/lib/localCompanyStore";
import { getCompanyDocFromBrowserDb } from "@/lib/localCompanyDocMirror";
import { isOfflineCompanyStorage } from "@/lib/companyUnlockGate";
import { resolveAuthoritativeFirestoreCompanyId } from "@/lib/resolveAuthoritativeFirestoreCompanyId";

const STORE = "pendingFiles";
const ATTACHMENT_HOLD_CLIPBOARD_PREFIX = "PL_ATTACH_V1:";

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

/** Pending file target doc — local company SQLite, online company Firestore. */
async function readCompanyDocForPendingSync(
  docPath: string,
  opts?: { includeDeleted?: boolean }
): Promise<Record<string, unknown> | null> {
  const p = String(docPath || "").trim();
  const m = /^companies\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(p);
  if (!m) return null;
  const [, companyId, collection, docId] = m;
  const pathsToTry: string[] = [];
  const seen = new Set<string>();
  const push = async (cid: string) => {
    const id = String(cid || "").trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    pathsToTry.push(`companies/${id}/${collection}/${docId}`);
  };
  await push(companyId!);
  await push(await resolveAuthoritativeFirestoreCompanyId(companyId!));

  for (const path of pathsToTry) {
    const parts = /^companies\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(path);
    if (!parts) continue;
    const [, cid, coll, did] = parts;
    const reg = await getLocalCompanyById(cid!, { includeDeleted: true });
    if (reg && isOfflineCompanyStorage(reg as { storageOption?: string })) {
      const row = (await getCompanyDocFromBrowserDb(cid!, coll!, did!, {
        includeDeleted: opts?.includeDeleted === true,
      })) as Record<string, unknown> | null;
      if (row) return row;
      continue;
    }
    const snap = await getDoc(firestoreDocRefFromPath(path));
    if (snap.exists()) return snap.data() as Record<string, unknown>;
  }
  return null;
}

/**
 * Pending patch se pehle target doc — recycle-bin (`isDeleted`) par bhi read;
 * doc bilkul nahi mila to queue row hatao taaki Drive sync "Document not found" par na atke.
 */
async function resolvePendingTargetDocOrRemoveOrphan(
  docPath: string,
  localId: string
): Promise<Record<string, unknown> | null> {
  let data = await readCompanyDocForPendingSync(docPath);
  if (!data) {
    data = await readCompanyDocForPendingSync(docPath, { includeDeleted: true });
  }
  if (!data) {
    try {
      await removePendingFile(localId);
    } catch {
      /* ignore */
    }
    console.warn("[localPendingFiles] orphan pending removed — target doc missing", { docPath, localId });
    return null;
  }
  return data;
}

/** `local:uuid` ko Drive URL / Storage URL se replace karke doc patch karo. */
async function patchPendingFileTargetField(
  docPath: string,
  field: string,
  localId: string,
  newValue: string
): Promise<void> {
  const data = await resolvePendingTargetDocOrRemoveOrphan(docPath, localId);
  // Orphan cleanup ho chuka — Drive bytes upload ho chuki ho to bhi sync cycle aage badhe.
  if (!data) return;
  const current = data[field];
  const needle = `${LOCAL_FILE_PREFIX}${localId}`;
  const docRef = firestoreDocRefFromPath(docPath);
  const decodeMarkerLocalSrc = (value: unknown): string | null => {
    const s = typeof value === "string" ? value.trim() : "";
    if (!s.startsWith(ATTACHMENT_HOLD_CLIPBOARD_PREFIX)) return null;
    const b64 = s.slice(ATTACHMENT_HOLD_CLIPBOARD_PREFIX.length);
    try {
      const json = decodeURIComponent(escape(atob(b64)));
      const obj = JSON.parse(json) as { src?: unknown };
      const src = typeof obj?.src === "string" ? obj.src.trim() : "";
      // Marker payload carries original local ref; match it so we replace instead of append duplicate.
      return src || null;
    } catch {
      return null;
    }
  };
  if (Array.isArray(current)) {
    const arr = [...current];
    const idx = arr.findIndex((v) => {
      if (v === needle) return true;
      const markerSrc = decodeMarkerLocalSrc(v);
      return markerSrc === needle;
    });
    if (idx >= 0) arr[idx] = newValue;
    else arr.push(newValue);
    await patchCompanyDocViaGateway(docRef, { [field]: arr });
    return;
  }
  await patchCompanyDocViaGateway(docRef, { [field]: newValue });
}

function companyIdFromStoragePrefix(prefix: string | undefined): string | null {
  const m = /^voucher-files\/([^/]+)\//.exec(String(prefix || "").trim());
  return m?.[1] ? m[1] : null;
}

function companyIdFromDocPath(docPath: string): string | null {
  const m = /^companies\/([^/]+)\//.exec(String(docPath || "").trim());
  return m?.[1] ? m[1] : null;
}

/** Pending upload route: docPath fallback fail ho to bhi storage prefix se company detect karke Drive path force karo. */
function resolvePendingPayloadCompanyId(item: {
  docPath?: string;
  storagePathPrefix?: string;
}): string | null {
  return companyIdFromDocPath(String(item.docPath || "")) ?? companyIdFromStoragePrefix(item.storagePathPrefix);
}

/** Local cloud-sync provider detect — Firebase Storage fallback ko local company par block/reroute karne ke liye. */
export async function resolvePendingAttachmentCloudSyncProvider(
  companyId: string
): Promise<CloudSyncProviderId | null> {
  const cid = String(companyId || "").trim();
  if (!cid) return null;
  if (await isGoogleDriveCloudSyncCompany(cid)) return "google_drive";
  const reg = await getLocalCompanyById(cid, { includeDeleted: true });
  const auth = String((reg as Record<string, unknown> | null)?.authoritativeCompanyId ?? "").trim();
  // Registry id vs authoritative id mismatch: pending row kisi bhi alias se aaye to selected provider detect hona chahiye.
  const aliases = new Set<string>([cid]);
  if (auth) aliases.add(auth);
  try {
    const all = await listLocalCompanies({ includeDeleted: true });
    for (const row of all) {
      const rid = String(row.id || "").trim();
      const rauth = String((row as Record<string, unknown>).authoritativeCompanyId ?? "").trim();
      if (
        aliases.has(rid) ||
        (rauth && aliases.has(rauth)) ||
        (rid && auth && rid === auth) ||
        (rauth && rauth === cid)
      ) {
        aliases.add(rid);
        if (rauth) aliases.add(rauth);
      }
    }
  } catch {
    /* alias expansion best-effort */
  }
  for (const alias of aliases) {
    if (await isGoogleDriveCloudSyncCompany(alias)) return "google_drive";
    const r = await getLocalCompanyById(alias, { includeDeleted: true });
    if (!r || !isOfflineCompanyStorage(r as { storageOption?: string })) continue;
    const provider = String((r as Record<string, unknown>).cloudSyncProvider ?? "").trim().toLowerCase();
    const enabled = (r as Record<string, unknown>).cloudSyncEnabled === true;
    if (!enabled) continue;
    const dataP = String((r as Record<string, unknown>).cloudSyncDataProvider ?? "").trim().toLowerCase();
    const filesP = String((r as Record<string, unknown>).cloudSyncFilesProvider ?? "").trim().toLowerCase();
    const legacyP = String((r as Record<string, unknown>).cloudSyncProvider ?? "").trim().toLowerCase();
    const pickFiles =
      filesP === "google_drive" || filesP === "drive"
        ? "google_drive"
        : legacyP === "google_drive" || legacyP === "drive"
          ? "google_drive"
          : dataP === "google_drive" || dataP === "drive"
            ? "google_drive"
            : null;
    if (pickFiles) return pickFiles;
  }
  return null;
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
  if (!usesEmbeddedNativeAttachmentStorage()) return;
  try {
    const rows = await listAttachmentFileRefs("pending_file");
    for (const row of rows) {
      if (!row?.id) continue;
      const meta = parsePendingMeta(row.metaJson);
      const fileUri = row.filePath ? await getAttachmentFileUriFromDataDir(row.filePath) : null;
      let displayUrl: string | undefined;
      if (fileUri && isCapacitorNativeApp()) {
        displayUrl = Capacitor.convertFileSrc(fileUri);
      } else if (row.filePath) {
        displayUrl =
          (await electronAttachmentDisplayUrlFromPath(row.filePath, row.contentType)) ?? undefined;
      }
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
  if (usesEmbeddedNativeAttachmentStorage()) {
    const row = await getAttachmentFileRef("pending_file", localId);
    if (!row) return null;
    const meta = parsePendingMeta(row.metaJson);
    const fileUri = row.filePath ? await getAttachmentFileUriFromDataDir(row.filePath) : null;
    let displayUrl: string | undefined;
    if (fileUri && isCapacitorNativeApp()) {
      displayUrl = Capacitor.convertFileSrc(fileUri);
    } else if (row.filePath) {
      displayUrl =
        (await electronAttachmentDisplayUrlFromPath(row.filePath, row.contentType)) ?? undefined;
    }
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
  /** `drive:` cloud download — company registry se Drive resolve. */
  companyId?: string;
};

/** Hot path helper: local:uuid open/preview ke liye full list read avoid. */
async function getPendingFileById(
  localId: string,
  options?: LocalFileReadOptions
): Promise<PendingFilePayload | null> {
  if (!localId?.trim()) return null;
  if (usesEmbeddedNativeAttachmentStorage()) {
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
      return await downloadCloudAttachmentBlob(remotePath, options?.companyId);
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
  storagePathPrefix: string,
  /** Sync cycle ne blob pehle hi padha ho to APK par dobara readFile/fetch avoid. */
  preloaded?: PendingFilePayload | null
): Promise<string> {
  if (!isLocalFileRef(localFileRef)) return localFileRef;
  const localId = localFileRef.slice(LOCAL_FILE_PREFIX.length);
  if (!localId) return localFileRef;
  const item = preloaded ?? (await getPendingFileById(localId));
  // Missing/corrupt bytes — caller ko fail dikhao; silent `local:` return sync "success" jaisa dikhta tha.
  if (!item?.blob || item.blob.size <= 0) {
    throw new Error(
      "Pending attachment could not be read on this device. Re-open the file or re-attach, then save and sync again."
    );
  }

  const docMatch = /^companies\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(String(item.docPath || "").trim());
  const targetCompanyId = resolvePendingPayloadCompanyId(item);
  const provider = targetCompanyId ? await resolvePendingAttachmentCloudSyncProvider(targetCompanyId) : null;
  if (targetCompanyId && provider === "google_drive") {
    const collection = docMatch?.[2] || "vouchers";
    const docId = docMatch?.[3] || item.id;
    const reg = await getLocalCompanyById(targetCompanyId, { includeDeleted: true });
    const driveRef = await uploadPendingAttachmentPayloadToDrive({
      companyId: targetCompanyId,
      companyName: reg?.name,
      company: reg,
      collection,
      docId,
      field: item.field,
      blob: item.blob,
      contentType: item.contentType,
      fileName: item.fileName,
    });
    await patchPendingFileTargetField(item.docPath, item.field, item.id, driveRef);
    await removePendingFile(item.id);
    return driveRef;
  }

  const reg = targetCompanyId ? await getLocalCompanyById(targetCompanyId, { includeDeleted: true }) : null;
  if (reg && isOfflineCompanyStorage(reg as { storageOption?: string })) {
    throw new Error(
      "Local company files must sync via Google Drive. Enable cloud sync — not Firebase Storage."
    );
  }

  // Upload one local file ref and return its final public URL for caller-side payload replacement.
  const storagePath = `${storagePathPrefix}/${Date.now()}_${item.fileName || "file"}`;
  const storageRef = ref(storage, storagePath);
  await uploadBytes(storageRef, item.blob, { contentType: item.contentType || "application/octet-stream" });
  const url = await getDownloadURL(storageRef);
  await patchPendingFileTargetField(item.docPath, item.field, item.id, url);
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
  if (usesEmbeddedNativeAttachmentStorage()) {
    // APK/EXE: bytes disk par; SQLite me path/meta row.
    const path = pendingFileDataDirPath(payload.id, payload.fileName);
    const ok = await writeAttachmentBlobToDataDir(path, payload.blob);
    if (!ok) throw new Error("Failed to persist pending attachment on device storage");
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
    const fileUri = await getAttachmentFileUriFromDataDir(path);
    let displayUrl: string | undefined;
    if (fileUri && isCapacitorNativeApp()) {
      displayUrl = Capacitor.convertFileSrc(fileUri);
    } else {
      displayUrl = (await electronAttachmentDisplayUrlFromPath(path, payload.contentType)) ?? undefined;
    }
    setLocalFileRefMetaCache({
      id: payload.id,
      contentType: payload.contentType || payload.blob.type || "application/octet-stream",
      fileName: payload.fileName,
      filePath: path,
      fileUri: fileUri ?? undefined,
      displayUrl,
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
  if (usesEmbeddedNativeAttachmentStorage()) {
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
  if (usesEmbeddedNativeAttachmentStorage()) {
    const row = await getAttachmentFileRef("pending_file", id);
    if (row?.filePath) await deleteAttachmentBlobFromDataDir(row.filePath);
    await deleteAttachmentFileRef("pending_file", id);
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
    const targetCompanyId = resolvePendingPayloadCompanyId(item);
    const provider = targetCompanyId ? await resolvePendingAttachmentCloudSyncProvider(targetCompanyId) : null;
    // Local company + cloud sync — Firebase Storage ki jagah selected provider route.
    if (targetCompanyId && provider === "google_drive") {
      const uploaded = await uploadPendingLocalFileRef(
        `${LOCAL_FILE_PREFIX}${item.id}`,
        item.storagePathPrefix,
        item
      );
      if (isLocalFileRef(uploaded)) {
        const label = "Google Drive";
        return {
          success: false,
          error: `Pending attachment was not uploaded to ${label}. Re-attach the file and try sync again.`,
        };
      }
      return { success: true };
    }

    const reg = targetCompanyId ? await getLocalCompanyById(targetCompanyId, { includeDeleted: true }) : null;
    if (reg && isOfflineCompanyStorage(reg as { storageOption?: string })) {
      return {
        success: false,
        error:
          "Local company: enable Google Drive sync to upload files. Firebase Storage is not used.",
      };
    }

    const storagePath = `${item.storagePathPrefix}/${Date.now()}_${item.fileName || "file"}`;
    const storageRef = ref(storage, storagePath);
    await uploadBytes(storageRef, item.blob, { contentType: item.contentType || "application/octet-stream" });
    const url = await getDownloadURL(storageRef);

    const data = await resolvePendingTargetDocOrRemoveOrphan(item.docPath, item.id);
    if (!data) {
      return { success: true };
    }
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
      await patchPendingFileTargetField(item.docPath, item.field, item.id, url);
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
      await patchPendingFileTargetField(item.docPath, item.field, item.id, url);
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
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (localPendingFilesForensicEnabled()) {
      console.warn("[FORENSIC_PENDING_SYNC_ONE]", {
        phase: "syncOnePendingFile",
        localId: item.id,
        success: false,
        error: msg,
      });
    }
    return { success: false, error: msg };
  }
}

/**
 * Sync all pending files to Storage and update Firestore docs. Call when online.
 */
export async function syncPendingFiles(): Promise<{
  synced: number;
  failed: number;
  /** Pehla failure reason — mobile sync status UI me generic count ke saath detail. */
  lastError?: string;
}> {
  const pending = await getPendingFiles();
  let synced = 0;
  let failed = 0;
  let lastError: string | undefined;
  for (const item of pending) {
    const result = await syncOnePendingFile(item);
    if (result.success) synced++;
    else {
      failed++;
      if (!lastError && result.error) lastError = result.error;
    }
  }
  return { synced, failed, lastError };
}

/** Drive sync cycle — sirf is company ke pending attachments/avatars upload karo. */
export async function syncPendingFilesForCompany(companyId: string): Promise<{
  synced: number;
  failed: number;
  lastError?: string;
}> {
  const cid = String(companyId || "").trim();
  if (!cid) return { synced: 0, failed: 0 };
  const pending = await getPendingFiles();
  const targetAliases = new Set<string>([cid]);
  try {
    const reg = await getLocalCompanyById(cid, { includeDeleted: true });
    const auth = String((reg as Record<string, unknown> | null)?.authoritativeCompanyId ?? "").trim();
    if (auth) targetAliases.add(auth);
    const all = await listLocalCompanies({ includeDeleted: true });
    for (const row of all) {
      const rid = String(row.id || "").trim();
      const rauth = String((row as Record<string, unknown>).authoritativeCompanyId ?? "").trim();
      if (
        targetAliases.has(rid) ||
        (rauth && targetAliases.has(rauth)) ||
        (rid && auth && rid === auth) ||
        (rauth && rauth === cid)
      ) {
        if (rid) targetAliases.add(rid);
        if (rauth) targetAliases.add(rauth);
      }
    }
  } catch {
    /* keep primary id only */
  }
  let synced = 0;
  let failed = 0;
  let lastError: string | undefined;
  for (const item of pending) {
    const itemCompanyId = resolvePendingPayloadCompanyId(item) ?? "";
    // Pending rows should sync when docPath/prefix uses any known alias for this company.
    if (!itemCompanyId || !targetAliases.has(itemCompanyId)) continue;
    const result = await syncOnePendingFile(item);
    if (result.success) synced++;
    else {
      failed++;
      if (!lastError && result.error) lastError = result.error;
    }
  }
  return { synced, failed, lastError };
}
