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
import { isDriveFileRef } from "@/lib/legacyDriveFileRef";
import { isGoogleDriveCloudSyncCompany, uploadPendingAttachmentPayloadToDrive } from "@/lib/localCloudSync/driveCloudSyncClient";
import { getLocalCompanyById, listLocalCompanies } from "@/lib/localCompanyStore";
import { getCompanyDocFromBrowserDb } from "@/lib/localCompanyDocMirror";
import { isPureLocalLedgerCompany } from "@/lib/companyStorageKind";
import { isOfflineCompanyStorage } from "@/lib/companyUnlockGate";
import { shouldReadLedgerFromSqliteOnly } from "@/lib/companyStorageKind";
import { shouldUseLocalCloudSync, isEligibleLocalDriveSyncCompanyRow } from "@/lib/localCloudSync/companyConfig";
import { resolveAuthoritativeFirestoreCompanyId } from "@/lib/resolveAuthoritativeFirestoreCompanyId";
import { apkEmbeddedSqliteFirstWritesPreferred } from "@/lib/apkOnlineFirestoreWritePolicy";

const STORE = "pendingFiles";
const ATTACHMENT_HOLD_CLIPBOARD_PREFIX = "PL_ATTACH_V1:";

/** Forensic: `NEXT_PUBLIC_ATTACHMENT_FORENSIC_DEBUG=1` — pending replace vs append + delete order proof. */
function localPendingFilesForensicEnabled(): boolean {
  return typeof process !== "undefined" && process.env.NEXT_PUBLIC_ATTACHMENT_FORENSIC_DEBUG === "1";
}

/** Upload ke baad SQLite mirror me final ref (https / drive:) verify. */
async function verifyLocalMirrorHasFieldRef(
  companyId: string,
  collection: string,
  docId: string,
  field: string,
  expectedRef: string
): Promise<boolean> {
  const row = await getCompanyDocFromBrowserDb(companyId, collection, docId, { includeDeleted: true });
  if (!row) return false;
  const cur = row[field];
  if (typeof cur === "string") return cur === expectedRef;
  if (Array.isArray(cur)) return cur.some((v) => v === expectedRef);
  return false;
}

async function mirrorUploadedFileUrlToLocalSqlite(
  docPath: string,
  field: string,
  localId: string,
  finalRef: string
): Promise<boolean> {
  const m = /^companies\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(String(docPath || "").trim());
  if (!m) return false;
  const [, companyId, collection, docId] = m;
  const existing = await getCompanyDocFromBrowserDb(companyId!, collection!, docId!, { includeDeleted: true });
  if (!existing) return false;
  const needle = `${LOCAL_FILE_PREFIX}${localId}`;
  const patch: Record<string, unknown> = {};
  const cur = existing[field];
  if (Array.isArray(cur)) {
    const arr = [...cur];
    const idx = arr.findIndex((v) => v === needle);
    if (idx < 0) return false;
    arr[idx] = finalRef;
    patch[field] = arr;
  } else if (cur === needle) {
    patch[field] = finalRef;
  } else {
    return false;
  }
  const { upsertCompanyDocInBrowserDb, notifyBrowserDbCollectionUpdated } = await import(
    "@/lib/localCompanyDocMirror"
  );
  await upsertCompanyDocInBrowserDb(
    companyId!,
    collection!,
    docId!,
    { ...existing, ...patch, id: docId },
    { notify: true, force: true }
  );
  notifyBrowserDbCollectionUpdated(companyId!, collection!);
  return verifyLocalMirrorHasFieldRef(companyId!, collection!, docId!, field, finalRef);
}

/** Upload ke baad SQLite mirror me HTTPS URL — verify hone ke baad hi local blob delete. */
async function verifyLocalMirrorHasHttpsUrl(
  companyId: string,
  collection: string,
  docId: string,
  field: string,
  httpsUrl: string
): Promise<boolean> {
  return verifyLocalMirrorHasFieldRef(companyId, collection, docId, field, httpsUrl);
}

/** Firestore pe HTTPS aa chuka ho lekin SQLite abhi `local:` — dubara upload ke bina mirror + delete. */
function resolveHttpsUrlAfterPendingPatch(fieldValue: unknown, localId: string): string | null {
  const needle = `${LOCAL_FILE_PREFIX}${localId}`;
  const isHttps = (v: unknown): v is string => typeof v === "string" && /^https?:\/\//i.test(v);
  if (typeof fieldValue === "string") {
    if (fieldValue === needle) return null;
    return isHttps(fieldValue) ? fieldValue : null;
  }
  if (Array.isArray(fieldValue)) {
    if (fieldValue.some((v) => v === needle)) return null;
    for (const v of fieldValue) {
      if (isHttps(v)) return v;
    }
  }
  return null;
}

function fieldStillHasLocalPendingRef(fieldValue: unknown, localId: string): boolean {
  const needle = `${LOCAL_FILE_PREFIX}${localId}`;
  if (typeof fieldValue === "string") return fieldValue === needle;
  if (Array.isArray(fieldValue)) return fieldValue.some((v) => v === needle);
  return false;
}

/** SQLite mirror ready → tab hi pending bytes hatao (HTTPS load hone ke baad). */
async function removePendingFileAfterMirrorReady(
  localId: string,
  docPath: string,
  field: string,
  httpsUrl: string
): Promise<boolean> {
  const mirrored = await mirrorUploadedFileUrlToLocalSqlite(docPath, field, localId, httpsUrl);
  if (!mirrored) {
    console.warn("[localPendingFiles] kept local blob — SQLite HTTPS mirror not verified yet", {
      localId,
      docPath,
      field,
    });
    return false;
  }
  await removePendingFile(localId);
  return true;
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
    const readSqliteMirror =
      (reg &&
        (isOfflineCompanyStorage(reg as { storageOption?: string }) ||
          shouldReadLedgerFromSqliteOnly(reg as Parameters<typeof shouldReadLedgerFromSqliteOnly>[0]))) ||
      apkEmbeddedSqliteFirstWritesPreferred();
    if (readSqliteMirror) {
      const row = (await getCompanyDocFromBrowserDb(cid!, coll!, did!, {
        includeDeleted: opts?.includeDeleted === true,
      })) as Record<string, unknown> | null;
      if (row) return row;
      if (reg && isOfflineCompanyStorage(reg as { storageOption?: string })) continue;
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
  if (!isValidPendingSubcollectionDocPath(docPath)) {
    console.warn("[localPendingFiles] pending sync skipped — invalid docPath (blob kept for requeue)", {
      docPath,
      localId,
    });
    return null;
  }
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
    if (idx >= 0) {
      arr[idx] = newValue;
    } else if (arr.includes(newValue)) {
      /* already patched — race se duplicate push mat karo */
    } else {
      const orphanLocalIdx = arr.findIndex((v) => {
        if (typeof v !== "string") return false;
        if (isLocalFileRef(v)) return true;
        const markerSrc = decodeMarkerLocalSrc(v);
        return markerSrc === needle;
      });
      if (orphanLocalIdx >= 0) arr[orphanLocalIdx] = newValue;
      else arr.push(newValue);
    }
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
export function resolvePendingPayloadCompanyId(item: {
  docPath?: string;
  storagePathPrefix?: string;
}): string | null {
  return companyIdFromDocPath(String(item.docPath || "")) ?? companyIdFromStoragePrefix(item.storagePathPrefix);
}

async function shouldKeepAttachmentsOffFirebase(companyId: string): Promise<boolean> {
  const cid = String(companyId || "").trim();
  if (!cid) return false;
  if (await shouldUseLocalCloudSync(cid)) return true;
  if (await isGoogleDriveCloudSyncCompany(cid)) return true;
  const row = await getLocalCompanyById(cid, { includeDeleted: true });
  if (!row) return false;
  if (isOfflineCompanyStorage(row as { storageOption?: string })) return true;
  if (isEligibleLocalDriveSyncCompanyRow(row)) return true;
  return isPureLocalLedgerCompany(row as Parameters<typeof isPureLocalLedgerCompany>[0]);
}

/** @deprecated — use shouldKeepAttachmentsOffFirebase */
async function isLocalOnlyPendingAttachmentCompany(companyId: string): Promise<boolean> {
  return shouldKeepAttachmentsOffFirebase(companyId);
}

/** Cloud sync removed — pending attachments always use Firebase Storage / native paths. */
export async function resolvePendingAttachmentCloudSyncProvider(
  companyId: string
): Promise<"google_drive" | null> {
  return (await isGoogleDriveCloudSyncCompany(companyId)) ? "google_drive" : null;
}

/** Pending item → device registry company id (Drive upload + SQLite patch). */
async function resolveRegistryCompanyIdForPendingItem(item: PendingFilePayload): Promise<string | null> {
  const fromPath = resolvePendingPayloadCompanyId(item);
  if (!fromPath) return null;
  const reg = await getLocalCompanyById(fromPath, { includeDeleted: true });
  if (reg) return fromPath;
  const rows = await listLocalCompanies({ includeDeleted: true });
  for (const row of rows) {
    const auth = String((row as Record<string, unknown>).authoritativeCompanyId ?? "").trim();
    if (row.id === fromPath || auth === fromPath) return row.id;
  }
  return fromPath;
}

async function syncOnePendingFileToDrive(
  item: PendingFilePayload,
  preData: Record<string, unknown>,
  registryCompanyId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!item.blob || item.blob.size <= 0) {
      throw new Error("Pending attachment bytes missing on this device.");
    }
    if (!fieldStillHasLocalPendingRef(preData[item.field], item.id)) {
      await removePendingFile(item.id);
      return { success: true };
    }
    const docMatch = /^companies\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(String(item.docPath || "").trim());
    if (!docMatch) return { success: false, error: "invalid doc path" };
    const [, , collection, docId] = docMatch;
    const reg = await getLocalCompanyById(registryCompanyId, { includeDeleted: true });
    const driveRef = await uploadPendingAttachmentPayloadToDrive({
      companyId: registryCompanyId,
      companyName: typeof reg?.name === "string" ? reg.name : undefined,
      company: (reg ?? null) as Record<string, unknown> | null,
      collection,
      docId,
      field: item.field,
      blob: item.blob,
      contentType: item.contentType,
      fileName: item.fileName,
    });
    await patchPendingFileTargetField(item.docPath, item.field, item.id, driveRef);
    const deleted = await removePendingFileAfterMirrorReady(item.id, item.docPath, item.field, driveRef);
    if (!deleted) {
      return {
        success: true,
        error: "Uploaded to Drive; local copy kept until this device finishes loading the file.",
      };
    }
    return { success: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: msg };
  }
}

/** Party/Bank/Staff/Item pending sync ke liye bhi yahi ref (pehle sirf vouchers tha). */
const PENDING_SYNC_COLLECTIONS = new Set([
  "vouchers",
  "parties",
  "bank_accounts",
  "staff",
  "items",
  "taxes",
  "expense_accounts",
]);

function isValidPendingSubcollectionDocPath(docPath: string): boolean {
  const m = /^companies\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(String(docPath || "").trim());
  if (!m) return false;
  return PENDING_SYNC_COLLECTIONS.has(m[2]!);
}

export { isValidPendingSubcollectionDocPath };

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
  /** Backup restore: SQLite index missing ho to fail — silent skip mat karo. */
  requireSqliteIndex?: boolean;
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
    try {
      const { downloadDriveAttachmentBlob } = await import("@/lib/localCloudSync/driveCloudSyncClient");
      return await downloadDriveAttachmentBlob(url, options?.companyId);
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
  void docMatch;
  void targetCompanyId;

  // Upload one local file ref and return its final public URL for caller-side payload replacement.
  const storagePath = `${storagePathPrefix}/${Date.now()}_${item.fileName || "file"}`;
  const storageRef = ref(storage, storagePath);
  await uploadBytes(storageRef, item.blob, { contentType: item.contentType || "application/octet-stream" });
  const url = await getDownloadURL(storageRef);
  await patchPendingFileTargetField(item.docPath, item.field, item.id, url);
  const deleted = await removePendingFileAfterMirrorReady(item.id, item.docPath, item.field, url);
  if (!deleted && localPendingFilesForensicEnabled()) {
    console.warn("[FORENSIC_PENDING_UPLOAD]", {
      phase: "uploadPendingLocalFileRef",
      localId: item.id,
      step: "KEPT_LOCAL_BLOB_UNTIL_SQLITE_HTTPS",
    });
  }
  if (deleted && localPendingFilesForensicEnabled()) {
    console.warn("[FORENSIC_PENDING_UPLOAD]", {
      phase: "uploadPendingLocalFileRef",
      localId: item.id,
      step: "AFTER_REMOVE_PENDING_FILE_COMPLETE",
      pendingBytesDeleted: true,
    });
  }
  return url;
}

export type PutPendingFileOptions = {
  /** Server receive path — remote `POST /__pl_attachment` must not re-enqueue upload. */
  skipPlServerAttachmentUploadEnqueue?: boolean;
};

export async function putPendingFile(
  payload: PendingFilePayload,
  options?: PutPendingFileOptions
): Promise<void> {
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
    await upsertAttachmentFileRef(
      {
        scope: "pending_file",
        id: payload.id,
        filePath: path,
        contentType: payload.contentType || payload.blob.type || "application/octet-stream",
        size: payload.blob.size || 0,
        metaJson: JSON.stringify(meta),
        updatedAt: createdAt,
        sha256Hex,
      },
      { required: payload.requireSqliteIndex === true }
    );
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
    if (!options?.skipPlServerAttachmentUploadEnqueue) {
      const { enqueuePlServerAttachmentUpload } = await import("@/lib/plServerAttachmentUploadQueue");
      enqueuePlServerAttachmentUpload(payload);
    }
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
      if (!options?.skipPlServerAttachmentUploadEnqueue) {
        void import("@/lib/plServerAttachmentUploadQueue").then(({ enqueuePlServerAttachmentUpload }) => {
          enqueuePlServerAttachmentUpload(payload);
        });
      }
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

/**
 * Backup restore: har file ek-ek karke pl-attachments (EXE/APK) ya IDB me likho,
 * phir SQLite index turant flush — agla file / reload se pehle bytes safe rahein.
 */
export async function saveRestoredAttachmentFile(payload: PendingFilePayload): Promise<string> {
  await putPendingFile({ ...payload, requireSqliteIndex: true });
  const localRef = `${LOCAL_FILE_PREFIX}${payload.id}`;
  if (usesEmbeddedNativeAttachmentStorage()) {
    const row = await getAttachmentFileRef("pending_file", payload.id);
    if (!row?.filePath) {
      throw new Error(
        `Restore could not index attachment "${payload.fileName || payload.id}" in local database`
      );
    }
    const blob = await readAttachmentBlobFromDataDir(
      row.filePath,
      row.contentType,
      row.sha256Hex ?? undefined
    );
    if (!blob || blob.size <= 0) {
      throw new Error(
        `Restore could not verify attachment bytes on disk for "${payload.fileName || payload.id}"`
      );
    }
    const { flushPendingBrowserDbSave } = await import("@/lib/localSqlite");
    await flushPendingBrowserDbSave();
    return localRef;
  }
  const pending = await getPendingFileById(payload.id);
  if (!pending?.blob || pending.blob.size <= 0) {
    throw new Error(`Restore could not verify attachment blob for "${payload.fileName || payload.id}"`);
  }
  return localRef;
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
 * Upload one pending file to Storage and update Firestore doc.
 * Local blob tab hi delete jab SQLite me HTTPS URL verify ho jaye.
 */
export async function syncOnePendingFile(
  item: PendingFilePayload
): Promise<{ success: boolean; error?: string }> {
  try {
    const preData = await resolvePendingTargetDocOrRemoveOrphan(item.docPath, item.id);
    if (!preData) {
      return { success: true };
    }

    const pendingCompanyId = resolvePendingPayloadCompanyId(item);
    const registryCompanyId =
      (pendingCompanyId ? await resolveRegistryCompanyIdForPendingItem(item) : null) ?? pendingCompanyId;
    const keepOffFirebase = registryCompanyId
      ? await shouldKeepAttachmentsOffFirebase(registryCompanyId)
      : false;
    if (keepOffFirebase && registryCompanyId) {
      const driveSync =
        (await resolvePendingAttachmentCloudSyncProvider(registryCompanyId)) === "google_drive";
      if (driveSync) {
        return syncOnePendingFileToDrive(item, preData, registryCompanyId);
      }
      if (!fieldStillHasLocalPendingRef(preData[item.field], item.id)) {
        await removePendingFile(item.id);
      }
      return { success: true };
    }

    const existingHttps = resolveHttpsUrlAfterPendingPatch(preData[item.field], item.id);
    if (existingHttps) {
      await removePendingFileAfterMirrorReady(item.id, item.docPath, item.field, existingHttps);
      return { success: true };
    }

    if (!fieldStillHasLocalPendingRef(preData[item.field], item.id)) {
      return { success: true };
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
          note: "STEP_FIRESTORE_PATCH_NEXT_then_SQLITE_MIRROR_then_PENDING_DELETE",
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
          note: "STEP_FIRESTORE_PATCH_NEXT_then_SQLITE_MIRROR_then_PENDING_DELETE",
        });
      }
      await patchPendingFileTargetField(item.docPath, item.field, item.id, url);
    }

    const deleted = await removePendingFileAfterMirrorReady(item.id, item.docPath, item.field, url);
    if (!deleted) {
      return {
        success: true,
        error: "Uploaded to cloud; local copy kept until this device finishes loading the HTTPS link.",
      };
    }

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
async function resolveCompanyTargetAliases(companyId: string): Promise<Set<string>> {
  const cid = String(companyId || "").trim();
  const targetAliases = new Set<string>();
  if (!cid) return targetAliases;
  targetAliases.add(cid);
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
  return targetAliases;
}

export async function listPendingFilesForCompany(companyId: string): Promise<PendingFilePayload[]> {
  const cid = String(companyId || "").trim();
  if (!cid) return [];
  const targetAliases = await resolveCompanyTargetAliases(cid);
  const pending = await getPendingFiles();
  return pending.filter((item) => {
    const itemCompanyId = resolvePendingPayloadCompanyId(item) ?? "";
    return itemCompanyId && targetAliases.has(itemCompanyId);
  });
}

export async function countPendingFilesForCompany(companyId: string): Promise<number> {
  return (await listPendingFilesForCompany(companyId)).length;
}

export async function syncPendingFilesForCompany(
  companyId: string,
  options?: { onProgress?: (done: number, total: number, fileName?: string) => void }
): Promise<{
  synced: number;
  failed: number;
  lastError?: string;
}> {
  const cid = String(companyId || "").trim();
  if (!cid) return { synced: 0, failed: 0 };
  const items = await listPendingFilesForCompany(cid);
  const total = items.length;
  let synced = 0;
  let failed = 0;
  let lastError: string | undefined;
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    options?.onProgress?.(i, total, item.fileName);
    const result = await syncOnePendingFile(item);
    if (result.success) synced++;
    else {
      failed++;
      if (!lastError && result.error) lastError = result.error;
    }
    options?.onProgress?.(i + 1, total, item.fileName);
  }
  return { synced, failed, lastError };
}
