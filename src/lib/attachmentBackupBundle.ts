"use client";

import {
  generateLocalFileId,
  getBlobFromLocalFileRef,
  getPendingPayloadForLocalRef,
  isLocalFileRef,
  LOCAL_FILE_PREFIX,
  saveRestoredAttachmentFile,
  type PendingFilePayload,
} from "@/lib/localPendingFiles";
import {
  getAttachmentBlobForBackupEmbed,
} from "@/lib/offlineAttachmentUrlCache";
import {
  stripOnlineLinkFieldsFromCompanyRow,
} from "@/lib/localBackupRestoreCompany";
import { looksLikeFirebaseStorageObjectPath } from "@/lib/firebaseStorageDownloadUrl";
import { backupPrefersLocalSnapshot } from "@/lib/backupLocalFirst";
import { normalizeAttachmentUrlForDevicePreview } from "@/lib/attachmentHoldClipboard";
import { isDriveFileRef } from "@/lib/legacyDriveFileRef";
import {
  inferAttachmentContentTypeFromName,
  sniffBlobKindForPreview,
} from "@/lib/attachmentFormatLabel";

/** `.plbp` JSON ke andar attachment bytes — Option A embed (URLs alag fields me rehti hain). */
export type AttachmentBundleEntry = {
  /** Doc me stored ref (local:uuid ya https URL) — restore par replace map key. */
  key: string;
  contentType: string;
  fileName?: string;
  size: number;
  /** Raw bytes base64 (no data: prefix). */
  dataBase64: string;
};

export type AttachmentBundle = {
  version: 1;
  entries: AttachmentBundleEntry[];
};

/** v3: attachments deflate zip ke andar — manifest me sirf paths (base64 JSON me nahi). */
export type AttachmentZipManifestEntry = {
  key: string;
  zipPath: string;
  contentType: string;
  fileName?: string;
  size: number;
};

export type AttachmentZipManifest = {
  version: 1;
  entries: AttachmentZipManifestEntry[];
};

const HTTPS_REF = /^https?:\/\//i;
/** Parallel attachment read — backup tez; EXE/APK par zyada workers. */
const BACKUP_ATTACH_CONCURRENCY = backupPrefersLocalSnapshot() ? 10 : 4;

export type AttachmentBackupResolveOptions = {
  skipDiskWrite?: boolean;
  localOnly?: boolean;
  /** Gallery/preview jaisa `local:`/`drive:` pairing + PL Server fetch. */
  companyId?: string;
  /** Saari company attachment refs — `drive:` ↔ `local:` gallery match ke liye. */
  galleryUrls?: readonly string[];
};

/** String attachment ref — local pending, `drive:`, HTTPS signed URL, ya Firebase object-path. */
export function isAttachmentRefString(v: unknown): v is string {
  if (typeof v !== "string" || !v.trim()) return false;
  const s = normalizeAttachmentUrlForDevicePreview(v.trim());
  return (
    isLocalFileRef(s) ||
    isDriveFileRef(s) ||
    HTTPS_REF.test(s) ||
    looksLikeFirebaseStorageObjectPath(s)
  );
}

/** Backup JSON me saari unique attachment refs collect — nested doc fields scan. */
export function collectAttachmentRefsFromValue(val: unknown, out: Set<string>): void {
  if (val == null) return;
  if (typeof val === "string") {
    const ref = normalizeAttachmentUrlForDevicePreview(val.trim());
    if (ref && isAttachmentRefString(ref)) out.add(ref);
    return;
  }
  if (Array.isArray(val)) {
    for (const item of val) collectAttachmentRefsFromValue(item, out);
    return;
  }
  if (typeof val === "object") {
    const o = val as Record<string, unknown>;
    if (typeof o.seconds === "number" && "nanoseconds" in o) return;
    if (o.__fsTs === true) return;
    for (const k of Object.keys(o)) collectAttachmentRefsFromValue(o[k], out);
  }
}

export function collectAttachmentRefsFromBackupData(backupData: Record<string, unknown>): string[] {
  const set = new Set<string>();
  for (const k of Object.keys(backupData)) {
    if (
      k === "attachmentBundle" ||
      k === "attachmentZipManifest" ||
      k === "includesAttachments" ||
      k === "backupVersion" ||
      k === "backupOfflineFiles"
    ) {
      continue;
    }
    collectAttachmentRefsFromValue(backupData[k], set);
  }
  return Array.from(set);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result || "");
      const idx = s.indexOf(",");
      resolve(idx >= 0 ? s.slice(idx + 1) : s);
    };
    r.onerror = () => reject(r.error ?? new Error("base64 read failed"));
    r.readAsDataURL(blob);
  });
}

function base64ToBlob(base64: string, contentType: string): Blob {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: contentType || "application/octet-stream" });
}

/**
 * Backup embed: gallery/fullscreen jaisa local-first resolve (cache, pending, drive pairing),
 * phir online par embed fetch — taaki device par dikhti files backup me bhi aayein.
 */
async function resolveAttachmentBlobForBackup(
  ref: string,
  signal?: AbortSignal,
  options?: AttachmentBackupResolveOptions
): Promise<Blob | null> {
  if (signal?.aborted) return null;
  const normalized = normalizeAttachmentUrlForDevicePreview(ref.trim()) || ref.trim();
  const { getBlobFromAttachmentRefPreferLocalFirst } = await import("@/lib/attachmentPreviewResolve");
  const localFirst = await getBlobFromAttachmentRefPreferLocalFirst(normalized, {
    companyId: options?.companyId,
    galleryUrls: options?.galleryUrls,
    localLedgerOnly: options?.localOnly === true,
  });
  if (localFirst && localFirst.size > 0) return localFirst;
  if (options?.localOnly) return null;
  if (isLocalFileRef(normalized)) {
    const item = await getPendingPayloadForLocalRef(normalized);
    if (item?.blob && item.blob.size > 0) return item.blob;
    return await getBlobFromLocalFileRef(normalized, { companyId: options?.companyId });
  }
  return getAttachmentBlobForBackupEmbed(normalized, {
    signal,
    skipDiskWrite: options?.skipDiskWrite,
    localOnly: options?.localOnly,
  });
}

function fileNameFromUrl(url: string): string | undefined {
  try {
    const path = new URL(url).pathname;
    const base = path.split("/").pop() || "";
    const decoded = decodeURIComponent(base.split("?")[0] || "");
    return decoded || undefined;
  } catch {
    return undefined;
  }
}

async function blobToUint8Array(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

function zipPathForAttachmentIndex(index: number, fileName?: string, contentType?: string): string {
  const fromName = String(fileName || "")
    .split(/[/\\]/)
    .pop()
    ?.trim();
  const extRaw = fromName?.includes(".") ? fromName.split(".").pop()?.toLowerCase() : "";
  let ext = extRaw && /^[a-z0-9]{1,8}$/.test(extRaw) ? `.${extRaw}` : "";
  if (!ext) {
    const ct = String(contentType || "").toLowerCase();
    if (ct.includes("jpeg") || ct.includes("jpg") || ct.includes("jfif")) ext = ".jpg";
    else if (ct.includes("png")) ext = ".png";
    else if (ct.includes("pdf")) ext = ".pdf";
    else if (ct.includes("webp")) ext = ".webp";
    else ext = ".bin";
  }
  return `attachments/f_${String(index).padStart(6, "0")}${ext}`;
}

/** Pool: refs parallel resolve — zip backup collect phase tez. */
async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
  signal?: AbortSignal
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length || 1) }, async () => {
    for (;;) {
      if (signal?.aborted) throw new DOMException("Backup cancelled", "AbortError");
      const i = nextIndex++;
      if (i >= items.length) break;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Backup preflight: ref resolve ho sakta hai ya nahi (bytes > 0). */
export async function probeAttachmentRefForBackup(
  ref: string,
  signal?: AbortSignal,
  options?: Pick<AttachmentBackupResolveOptions, "localOnly" | "companyId" | "galleryUrls">
): Promise<boolean> {
  try {
    const blob = await resolveAttachmentBlobForBackup(ref, signal, options);
    return !!(blob && blob.size > 0);
  } catch {
    return false;
  }
}

/** Har ref ke liye bytes resolve karke bundle banao — fail refs skip (data-only URLs reh sakti hain). */
export async function buildAttachmentBundleFromRefs(
  refs: string[],
  onProgress?: (done: number, total: number, bytesAdded: number) => void,
  signal?: AbortSignal,
  options?: Pick<AttachmentBackupResolveOptions, "skipDiskWrite" | "companyId" | "galleryUrls">
): Promise<AttachmentBundle> {
  const entries: AttachmentBundleEntry[] = [];
  const total = refs.length;
  let done = 0;
  for (const key of refs) {
    if (signal?.aborted) throw new DOMException("Backup cancelled", "AbortError");
    let bytesAdded = 0;
    try {
      let blob: Blob | null = null;
      let fileName: string | undefined;
      blob = await resolveAttachmentBlobForBackup(key, signal, {
        skipDiskWrite: options?.skipDiskWrite,
        companyId: options?.companyId,
        galleryUrls: options?.galleryUrls ?? refs,
      });
      if (blob && blob.size > 0) {
        if (isLocalFileRef(key)) {
          const item = await getPendingPayloadForLocalRef(key);
          fileName = item?.fileName;
        } else {
          fileName = fileNameFromUrl(key);
        }
      }
      if (blob && blob.size > 0) {
        const rawSize = blob.size;
        entries.push({
          key,
          contentType: blob.type || "application/octet-stream",
          fileName,
          size: rawSize,
          dataBase64: await blobToBase64(blob),
        });
        // Base64 expand ~4/3 — throughput metric me include taaki Mbps realistic rahe.
        bytesAdded = Math.round(rawSize * 1.34);
      }
    } catch (e) {
      console.warn("[attachmentBackup] skip ref", key, e);
    }
    done += 1;
    onProgress?.(done, total, bytesAdded);
  }
  return { version: 1, entries };
}

export type BuildAttachmentZipFromRefsOptions = {
  /** Saved backup folder se pichle `.plbp` ke bytes — sirf nayi refs download. */
  previousCache?: Map<string, { entry: AttachmentZipManifestEntry; fileBytes: Uint8Array }>;
  /** Collect phase: disk par dubara mat likho — zip me embed karna kaafi. */
  skipDiskWrite?: boolean;
  companyId?: string;
  galleryUrls?: readonly string[];
};

/** v3 zip backup: sirf `refs` list (current company snapshot) — deleted refs purane cache se add nahi hote. */
export async function buildAttachmentZipFromRefs(
  refs: string[],
  onProgress?: (done: number, total: number, bytesAdded: number) => void,
  signal?: AbortSignal,
  options?: BuildAttachmentZipFromRefsOptions
): Promise<{ manifest: AttachmentZipManifest; files: Record<string, Uint8Array> }> {
  const total = refs.length;
  let done = 0;
  const previousCache = options?.previousCache;
  const resolved = await mapWithConcurrency(
    refs,
    BACKUP_ATTACH_CONCURRENCY,
    async (key) => {
      if (signal?.aborted) throw new DOMException("Backup cancelled", "AbortError");
      let bytesAdded = 0;
      let entry: AttachmentZipManifestEntry | null = null;
      let fileBytes: Uint8Array | null = null;
      try {
        const cached = previousCache?.get(key);
        if (cached?.fileBytes?.length) {
          entry = { ...cached.entry, zipPath: "" };
          fileBytes = cached.fileBytes;
        } else {
          const blob = await resolveAttachmentBlobForBackup(key, signal, {
            skipDiskWrite: options?.skipDiskWrite,
            companyId: options?.companyId,
            galleryUrls: options?.galleryUrls ?? refs,
          });
          if (blob && blob.size > 0) {
            let fileName: string | undefined;
            if (isLocalFileRef(key)) {
              fileName = (await getPendingPayloadForLocalRef(key))?.fileName;
            } else {
              fileName = fileNameFromUrl(key);
            }
            const contentType = blob.type || "application/octet-stream";
            fileBytes = await blobToUint8Array(blob);
            entry = {
              key,
              zipPath: "",
              contentType,
              fileName,
              size: blob.size,
            };
            bytesAdded = blob.size;
          }
        }
      } catch (e) {
        console.warn("[attachmentBackupZip] skip ref", key, e);
      }
      done += 1;
      onProgress?.(done, total, bytesAdded);
      return { entry, fileBytes };
    },
    signal
  );

  const manifest: AttachmentZipManifest = { version: 1, entries: [] };
  const files: Record<string, Uint8Array> = {};
  let fileIndex = 0;
  for (const row of resolved) {
    if (!row.entry || !row.fileBytes?.length) continue;
    fileIndex += 1;
    const zipPath = zipPathForAttachmentIndex(fileIndex, row.entry.fileName, row.entry.contentType);
    manifest.entries.push({ ...row.entry, zipPath });
    files[zipPath] = row.fileBytes;
  }
  return { manifest, files };
}

export function getAttachmentRestoreEntryCount(data: Record<string, unknown> | null | undefined): number {
  if (!data) return 0;
  const zipMan = data.attachmentZipManifest as AttachmentZipManifest | undefined;
  if (Array.isArray(zipMan?.entries)) return zipMan.entries.filter((e) => e?.key && e.zipPath).length;
  const bundle = data.attachmentBundle as AttachmentBundle | undefined;
  return bundle?.entries?.filter((e) => e?.key && e.dataBase64).length ?? 0;
}

export function backupDataHasAttachmentBundle(data: Record<string, unknown> | null | undefined): boolean {
  return getAttachmentRestoreEntryCount(data) > 0;
}

/** Restore warning: tick/URL backup me hai lekin `.plbp` me file bytes embed nahi (purana ya failed backup). */
export function backupDataHasOrphanAttachmentRefs(data: Record<string, unknown> | null | undefined): boolean {
  if (!data) return false;
  if (backupDataHasAttachmentBundle(data)) return false;
  return collectAttachmentRefsFromBackupData(data).length > 0;
}

export type AttachmentRefRestoreTarget = {
  docPath: string;
  field: string;
  storagePathPrefix: string;
};

const BACKUP_META_KEYS = new Set([
  "attachmentBundle",
  "attachmentZipManifest",
  "includesAttachments",
  "backupVersion",
  "backupOfflineFiles",
  "backupIntent",
  "companyDetails",
]);

/** `.plbp` with embedded bytes — manifest keys (Firebase HTTPS / device local:) ko stable offline refs. */
export function offlineEmbeddedAttachmentRef(index: number): string {
  return `${LOCAL_FILE_PREFIX}plbk_${String(index).padStart(6, "0")}`;
}

/** Company row: online / Firebase / Drive sync fields hatao — restore par local SQLite company. */
export function sanitizeCompanyRowForOfflineFileBackup(row: Record<string, unknown>): Record<string, unknown> {
  const out = stripOnlineLinkFieldsFromCompanyRow(row);
  delete out.ownerId;
  out.storageOption = "local";
  out.syncPolicy = "offline";
  out.syncedFromCloud = false;
  return out;
}

function sanitizeCompanyDetailsForOfflineFileBackup(details: unknown): unknown {
  if (!Array.isArray(details)) return details;
  return details.map((row) =>
    row && typeof row === "object"
      ? sanitizeCompanyRowForOfflineFileBackup(row as Record<string, unknown>)
      : row
  );
}

function registerOfflineBackupRefAlias(map: Map<string, string>, original: string, offlineKey: string): void {
  const trimmed = String(original || "").trim();
  if (!trimmed) return;
  map.set(trimmed, offlineKey);
  const norm = normalizeAttachmentUrlForDevicePreview(trimmed);
  if (norm && norm !== trimmed) map.set(norm, offlineKey);
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const u = new URL(trimmed);
      map.set(`${u.origin}${u.pathname}`, offlineKey);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Backup with files: JSON me Firebase/HTTPS refs mat rakho — sirf embedded `local:plbk_*` keys.
 * Restore par ye keys naye device `local:` refs ban jati hain; purane URLs ka koi kaam nahi.
 */
export function prepareBackupDataForOfflineFileBackup(
  backupData: Record<string, unknown>,
  manifest: AttachmentZipManifest
): { backupData: Record<string, unknown>; manifest: AttachmentZipManifest } {
  const refMap = new Map<string, string>();
  const embeddedOfflineRefs = new Set<string>();
  const newEntries: AttachmentZipManifestEntry[] = [];
  let fileIndex = 0;

  for (const entry of manifest.entries || []) {
    if (!entry?.key || !entry.zipPath) continue;
    // Pending / device `local:` refs — backup me same pending key rakho (plbk_ remap mat).
    if (isLocalFileRef(entry.key)) {
      embeddedOfflineRefs.add(entry.key);
      registerOfflineBackupRefAlias(refMap, entry.key, entry.key);
      newEntries.push({ ...entry });
      continue;
    }
    fileIndex += 1;
    const offlineKey = offlineEmbeddedAttachmentRef(fileIndex);
    embeddedOfflineRefs.add(offlineKey);
    registerOfflineBackupRefAlias(refMap, entry.key, offlineKey);
    newEntries.push({ ...entry, key: offlineKey });
  }

  const mapped = applyAttachmentRefMapToBackupData(backupData, refMap);
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(mapped)) {
    if (k === "attachmentBundle" || k === "attachmentZipManifest") continue;
    if (BACKUP_META_KEYS.has(k)) {
      if (k === "companyDetails") {
        out.companyDetails = sanitizeCompanyDetailsForOfflineFileBackup(mapped.companyDetails);
      } else if (k !== "backupOfflineFiles" && k !== "backupIntent") {
        out[k] = mapped[k];
      }
      continue;
    }
    out[k] = stripAttachmentRefsForLocalCompanyRestore(mapped[k], embeddedOfflineRefs);
  }
  out.includesAttachments = true;
  out.backupVersion = mapped.backupVersion ?? 3;
  out.backupOfflineFiles = true;
  out.backupIntent = "for_offline";
  if (out.companyDetails === undefined && mapped.companyDetails !== undefined) {
    out.companyDetails = sanitizeCompanyDetailsForOfflineFileBackup(mapped.companyDetails);
  }

  return {
    backupData: out,
    manifest: { version: 1, entries: newEntries },
  };
}

/**
 * Offline-intent backup (data-only ya final pass): HTTPS/Firebase/Drive refs hatao,
 * company row local/offline mark — restore SQLite-only + read/write local.
 */
export function prepareBackupDataForOfflineIntent(
  backupData: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(backupData)) {
    if (k === "attachmentBundle" || k === "attachmentZipManifest") continue;
    if (BACKUP_META_KEYS.has(k)) {
      if (k === "companyDetails") {
        out.companyDetails = sanitizeCompanyDetailsForOfflineFileBackup(backupData.companyDetails);
      } else if (k !== "backupOfflineFiles" && k !== "backupIntent") {
        out[k] = backupData[k];
      }
      continue;
    }
    out[k] = stripRemoteAttachmentRefsInValue(backupData[k]);
  }
  out.backupVersion = backupData.backupVersion ?? 3;
  out.includesAttachments = backupData.includesAttachments === true;
  out.backupOfflineFiles = true;
  out.backupIntent = "for_offline";
  if (out.companyDetails === undefined && backupData.companyDetails !== undefined) {
    out.companyDetails = sanitizeCompanyDetailsForOfflineFileBackup(backupData.companyDetails);
  }
  return out;
}

/** `.plbp` offline-portable? — restore destination SQLite force + company offline mark. */
export function isOfflineIntentBackupData(data: Record<string, unknown> | null | undefined): boolean {
  if (!data || typeof data !== "object") return false;
  if (data.backupIntent === "for_offline") return true;
  if (data.backupOfflineFiles === true) return true;
  return false;
}

function inferRestoreStoragePathPrefix(
  collectionName: string,
  doc: Record<string, unknown>,
  companyId: string,
  fieldKey: string
): string {
  if (collectionName === "vouchers") {
    const voucherType = String(doc.type || "journal").trim() || "journal";
    return `voucher-files/${companyId}/${voucherType}`;
  }
  if (["parties", "bank_accounts", "staff", "taxes", "expense_accounts", "items"].includes(collectionName)) {
    const seg = collectionName.replace(/_/g, "-");
    const sub =
      fieldKey === "fileUrl" || fieldKey === "avatarUrl" || fieldKey === "logoUrl" ? "avatar" : "documents";
    return `companies/${companyId}/${seg}-files/${sub}`;
  }
  if (fieldKey === "logoUrl") return `companies/${companyId}/logo`;
  return `companies/${companyId}/attachments`;
}

function registerAttachmentRefTarget(
  ref: string,
  target: AttachmentRefRestoreTarget,
  out: Map<string, AttachmentRefRestoreTarget>
): void {
  if (!out.has(ref)) out.set(ref, target);
}

function scanRecordForAttachmentTargets(
  record: Record<string, unknown>,
  docPath: string,
  collectionName: string,
  companyId: string,
  out: Map<string, AttachmentRefRestoreTarget>
): void {
  for (const key of ["fileUrls", "documentFileUrls"] as const) {
    const arr = record[key];
    if (!Array.isArray(arr)) continue;
    for (const v of arr) {
      if (!isAttachmentRefString(v)) continue;
      registerAttachmentRefTarget(
        v,
        {
          docPath,
          field: key,
          storagePathPrefix: inferRestoreStoragePathPrefix(collectionName, record, companyId, key),
        },
        out
      );
    }
  }
  for (const key of ["fileUrl", "avatarUrl", "logoUrl"] as const) {
    const v = record[key];
    if (!isAttachmentRefString(v)) continue;
    registerAttachmentRefTarget(
      v,
      {
        docPath,
        field: key,
        storagePathPrefix: inferRestoreStoragePathPrefix(collectionName, record, companyId, key),
      },
      out
    );
  }
  const unassigned = record.unassignedFile;
  if (unassigned && typeof unassigned === "object") {
    const url = (unassigned as { url?: unknown }).url;
    if (isAttachmentRefString(url)) {
      registerAttachmentRefTarget(
        url,
        {
          docPath,
          field: "unassignedFile",
          storagePathPrefix: inferRestoreStoragePathPrefix(collectionName, record, companyId, "fileUrls"),
        },
        out
      );
    }
  }
}

/** Backup JSON scan — har attachment ref ka asli docPath/field (pending upload + cloud patch ke liye). */
export function collectAttachmentRefTargetsFromBackupData(
  backupData: Record<string, unknown>,
  targetCompanyId: string
): Map<string, AttachmentRefRestoreTarget> {
  const out = new Map<string, AttachmentRefRestoreTarget>();
  const cid = String(targetCompanyId || "").trim();
  if (!cid) return out;

  for (const [colName, val] of Object.entries(backupData)) {
    if (BACKUP_META_KEYS.has(colName) || !Array.isArray(val)) continue;
    for (const row of val) {
      if (!row || typeof row !== "object") continue;
      const docId = String((row as { id?: unknown }).id ?? "").trim();
      if (!docId) continue;
      scanRecordForAttachmentTargets(
        row as Record<string, unknown>,
        `companies/${cid}/${colName}/${docId}`,
        colName,
        cid,
        out
      );
    }
  }
  return out;
}

function resolveRestoreTargetForEntry(
  entryKey: string,
  targetCompanyId: string,
  targets: Map<string, AttachmentRefRestoreTarget>
): AttachmentRefRestoreTarget {
  const hit = targets.get(entryKey);
  if (hit) return hit;
  const norm = normalizeAttachmentUrlForDevicePreview(entryKey);
  if (norm && norm !== entryKey) {
    const normHit = targets.get(norm);
    if (normHit) return normHit;
  }
  return {
    docPath: `companies/${targetCompanyId}/vouchers/restored-orphan`,
    field: "fileUrls",
    storagePathPrefix: `companies/${targetCompanyId}/restored-files`,
  };
}

function registerRestoredRefInMap(map: Map<string, string>, oldKey: string, newRef: string): void {
  const key = String(oldKey || "").trim();
  if (!key || !newRef) return;
  map.set(key, newRef);
  const norm = normalizeAttachmentUrlForDevicePreview(key);
  if (norm && norm !== key) map.set(norm, newRef);
  if (key.startsWith("http://") || key.startsWith("https://")) {
    try {
      const u = new URL(key);
      const noQuery = `${u.origin}${u.pathname}`;
      if (noQuery !== key) map.set(noQuery, newRef);
    } catch {
      /* ignore */
    }
  }
}

function resolveZipEntryBytes(
  filesByPath: Map<string, Uint8Array>,
  zipPath: string
): Uint8Array | null {
  const raw = String(zipPath || "").trim();
  if (!raw || !filesByPath.size) return null;
  const direct = filesByPath.get(raw);
  if (direct?.length) return direct;
  const norm = raw.replace(/\\/g, "/");
  for (const [path, bytes] of filesByPath.entries()) {
    if (path.replace(/\\/g, "/") === norm && bytes?.length) return bytes;
  }
  const base = norm.split("/").pop();
  if (base) {
    for (const [path, bytes] of filesByPath.entries()) {
      const pNorm = path.replace(/\\/g, "/");
      if ((pNorm === base || pNorm.endsWith(`/${base}`)) && bytes?.length) return bytes;
    }
  }
  return null;
}

/** fflate Uint8Array → Blob (copy) + magic-byte sniff taaki restore preview FILE icon na rahe. */
async function blobFromRestoredZipBytes(
  bytes: Uint8Array,
  contentType?: string,
  fileName?: string
): Promise<{ blob: Blob; contentType: string; fileName?: string }> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  let ct = inferAttachmentContentTypeFromName(fileName, contentType);
  let name = fileName;
  let blob = new Blob([copy], { type: ct || "application/octet-stream" });
  const kind = await sniffBlobKindForPreview(blob);
  if (kind === "pdf" && !String(ct || "").toLowerCase().includes("pdf")) {
    ct = "application/pdf";
    blob = new Blob([copy], { type: ct });
    if (!name || !/\.pdf$/i.test(name)) name = `${name || "restored"}.pdf`.replace(/\.pdf\.pdf$/i, ".pdf");
  } else if (kind === "image") {
    const lower = String(ct || "").toLowerCase();
    if (!lower.startsWith("image/")) {
      // JPEG magic is most common for voucher photos; sniff already confirmed image.
      const u8 = copy;
      if (u8[0] === 0x89 && u8[1] === 0x50) ct = "image/png";
      else if (u8[0] === 0x47 && u8[1] === 0x49) ct = "image/gif";
      else if (u8[0] === 0x52 && u8[1] === 0x49) ct = "image/webp";
      else ct = "image/jpeg";
      blob = new Blob([copy], { type: ct });
    }
    const ext =
      ct === "image/png"
        ? ".png"
        : ct === "image/gif"
          ? ".gif"
          : ct === "image/webp"
            ? ".webp"
            : ".jpg";
    if (!name || !/\.(jpe?g|png|gif|webp|bmp)$/i.test(name)) {
      name = `${String(name || "restored").replace(/\.[a-z0-9]{1,8}$/i, "")}${ext}`;
    }
  }
  return { blob, contentType: ct || blob.type || "application/octet-stream", fileName: name };
}

async function persistRestoredAttachmentEntry(
  entryKey: string,
  blob: Blob,
  contentType: string,
  fileName: string | undefined,
  targetCompanyId: string,
  targets: Map<string, AttachmentRefRestoreTarget>,
  map: Map<string, string>
): Promise<void> {
  const id = generateLocalFileId();
  const target = resolveRestoreTargetForEntry(entryKey, targetCompanyId, targets);
  const payload: PendingFilePayload = {
    id,
    blob,
    contentType: contentType || blob.type || "application/octet-stream",
    docPath: target.docPath,
    field: target.field,
    storagePathPrefix: target.storagePathPrefix,
    fileName: fileName || `restored_${id.slice(0, 8)}`,
  };
  const localRef = await saveRestoredAttachmentFile(payload);
  registerRestoredRefInMap(map, entryKey, localRef);
}

/** Restore: bundle se pending `local:` files + purane ref → naya ref map. */
export async function restoreAttachmentBundleToLocalRefs(
  bundle: AttachmentBundle,
  targetCompanyId: string,
  onProgress?: (done: number, total: number, bytesAdded: number) => void,
  signal?: AbortSignal,
  refTargets?: Map<string, AttachmentRefRestoreTarget>
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const targets = refTargets ?? new Map<string, AttachmentRefRestoreTarget>();
  const entries = (bundle.entries || []).filter((e) => e?.key && e.dataBase64);
  const total = entries.length;
  let done = 0;
  for (const entry of entries) {
    if (signal?.aborted) throw new DOMException("Restore cancelled", "AbortError");
    try {
      const blob = base64ToBlob(entry.dataBase64, entry.contentType);
      await persistRestoredAttachmentEntry(
        entry.key,
        blob,
        entry.contentType || blob.type || "application/octet-stream",
        entry.fileName,
        targetCompanyId,
        targets,
        map
      );
      done += 1;
      onProgress?.(done, total, entry.size ?? blob.size);
    } catch (e) {
      console.warn("[attachmentRestore] skip entry", entry.key, e);
      done += 1;
      onProgress?.(done, total, 0);
    }
  }
  return map;
}

/** v3 zip se restore — zipPath se bytes, phir local: pending file. */
export async function restoreAttachmentZipToLocalRefs(
  manifest: AttachmentZipManifest,
  filesByPath: Map<string, Uint8Array>,
  targetCompanyId: string,
  onProgress?: (done: number, total: number, bytesAdded: number) => void,
  signal?: AbortSignal,
  refTargets?: Map<string, AttachmentRefRestoreTarget>
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const targets = refTargets ?? new Map<string, AttachmentRefRestoreTarget>();
  const entries = (manifest.entries || []).filter((e) => e?.key && e.zipPath);
  const total = entries.length;
  let done = 0;
  for (const entry of entries) {
    if (signal?.aborted) throw new DOMException("Restore cancelled", "AbortError");
    try {
      const bytes = resolveZipEntryBytes(filesByPath, entry.zipPath);
      if (!bytes?.length) throw new Error(`zip entry missing: ${entry.zipPath}`);
      const typed = await blobFromRestoredZipBytes(bytes, entry.contentType, entry.fileName);
      await persistRestoredAttachmentEntry(
        entry.key,
        typed.blob,
        typed.contentType,
        typed.fileName,
        targetCompanyId,
        targets,
        map
      );
      done += 1;
      onProgress?.(done, total, entry.size ?? typed.blob.size);
    } catch (e) {
      console.warn("[attachmentRestoreZip] skip entry", entry.key, entry.zipPath, e);
      done += 1;
      onProgress?.(done, total, 0);
    }
  }
  return map;
}

/** v2 base64 bundle ya v3 zip — restore handler ek hi entry point. */
export async function restoreAttachmentsFromBackupData(
  backupData: Record<string, unknown>,
  zipFilesByPath: Map<string, Uint8Array> | null | undefined,
  targetCompanyId: string,
  onProgress?: (done: number, total: number, bytesAdded: number) => void,
  signal?: AbortSignal
): Promise<Map<string, string>> {
  const refTargets = collectAttachmentRefTargetsFromBackupData(backupData, targetCompanyId);
  const zipMan = backupData.attachmentZipManifest as AttachmentZipManifest | undefined;
  const hasZipBytes = Boolean(zipFilesByPath && zipFilesByPath.size > 0);
  if (Array.isArray(zipMan?.entries) && zipMan.entries.length > 0 && hasZipBytes) {
    return restoreAttachmentZipToLocalRefs(
      zipMan,
      zipFilesByPath!,
      targetCompanyId,
      onProgress,
      signal,
      refTargets
    );
  }
  const bundle = backupData.attachmentBundle as AttachmentBundle | undefined;
  if (Array.isArray(bundle?.entries) && bundle.entries.length > 0) {
    return restoreAttachmentBundleToLocalRefs(bundle, targetCompanyId, onProgress, signal, refTargets);
  }
  if (Array.isArray(zipMan?.entries) && zipMan.entries.length > 0) {
    console.warn(
      "[attachmentRestore] zip manifest has entries but zip bytes missing — cannot restore files",
      zipMan.entries.length
    );
  }
  return new Map();
}

/** Replace attachment refs deep in backup payload before SQLite/Firestore write. */
function lookupAttachmentRefInRestoreMap(map: Map<string, string>, raw: string): string | undefined {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return undefined;
  const direct = map.get(trimmed);
  if (direct) return direct;
  const norm = normalizeAttachmentUrlForDevicePreview(trimmed);
  if (norm && norm !== trimmed) {
    const hit = map.get(norm);
    if (hit) return hit;
  }
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const u = new URL(trimmed);
      const noQuery = `${u.origin}${u.pathname}`;
      const hit = map.get(noQuery);
      if (hit) return hit;
    } catch {
      /* ignore */
    }
  }
  for (const [key, value] of map.entries()) {
    if (normalizeAttachmentUrlForDevicePreview(key) === norm) return value;
  }
  return undefined;
}

/** Local company restore: Firebase/HTTPS/drive refs device par rehne nahi chahiye. */
export function isRemoteAttachmentRefForLocalCompany(s: string): boolean {
  const t = String(s || "").trim();
  if (!t) return false;
  if (isLocalFileRef(t)) return false;
  return HTTPS_REF.test(t) || looksLikeFirebaseStorageObjectPath(t) || isDriveFileRef(t);
}

function stripRemoteAttachmentRefString(s: string): string | null {
  const t = String(s || "").trim();
  if (!t) return null;
  if (isRemoteAttachmentRefForLocalCompany(t)) return null;
  return t;
}

/** Deep walk — `fileUrls` / `fileUrl` me bachi HTTPS entries hatao (local restore hygiene). */
export function stripRemoteAttachmentRefsInValue(val: unknown, depth = 0): unknown {
  if (depth > 32) return val;
  if (val == null) return val;
  if (typeof val === "string") {
    return stripRemoteAttachmentRefString(val);
  }
  if (Array.isArray(val)) {
    const next = val
      .map((item) => stripRemoteAttachmentRefsInValue(item, depth + 1))
      .filter((item) => item != null && item !== "");
    return next;
  }
  if (typeof val === "object") {
    const o = val as Record<string, unknown>;
    if (typeof o.seconds === "number" && "nanoseconds" in o) return val;
    if (o.__fsTs === true) return val;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(o)) {
      out[k] = stripRemoteAttachmentRefsInValue(o[k], depth + 1);
    }
    return out;
  }
  return val;
}

function stripAttachmentRefForLocalCompanyRestore(
  raw: string,
  restoredLocalRefs: Set<string>
): string | null {
  const t = String(raw || "").trim();
  if (!t) return null;
  if (isRemoteAttachmentRefForLocalCompany(t)) return null;
  if (isLocalFileRef(t)) return restoredLocalRefs.has(t) ? t : null;
  return t;
}

/** Local restore: remote + stale `local:` refs hatao; sirf abhi restore hue device refs rakho. */
export function stripAttachmentRefsForLocalCompanyRestore(
  val: unknown,
  restoredLocalRefs: Set<string>,
  depth = 0
): unknown {
  if (depth > 32) return val;
  if (val == null) return val;
  if (typeof val === "string") {
    return stripAttachmentRefForLocalCompanyRestore(val, restoredLocalRefs);
  }
  if (Array.isArray(val)) {
    return val
      .map((item) => stripAttachmentRefsForLocalCompanyRestore(item, restoredLocalRefs, depth + 1))
      .filter((item) => item != null && item !== "");
  }
  if (typeof val === "object") {
    const o = val as Record<string, unknown>;
    if (typeof o.seconds === "number" && "nanoseconds" in o) return val;
    if (o.__fsTs === true) return val;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(o)) {
      out[k] = stripAttachmentRefsForLocalCompanyRestore(o[k], restoredLocalRefs, depth + 1);
    }
    return out;
  }
  return val;
}

/**
 * Local SQLite company restore: embedded bytes → `local:` map, phir bachi remote URLs strip.
 * Taaki local company kabhi Firebase/HTTPS se file na khole ya sync na kare.
 */
export function prepareBackupDataForLocalCompanyRestore(
  backupData: Record<string, unknown>,
  attachmentRefMap?: Map<string, string>
): Record<string, unknown> {
  const restoredLocalRefs = new Set<string>();
  if (attachmentRefMap?.size) {
    for (const nextRef of attachmentRefMap.values()) {
      if (isLocalFileRef(nextRef)) restoredLocalRefs.add(nextRef);
    }
  }
  const offlineSanitized = isOfflineIntentBackupData(backupData)
    ? backupData
    : prepareBackupDataForOfflineIntent(backupData);
  const mapped = attachmentRefMap?.size
    ? applyAttachmentRefMapToBackupData(offlineSanitized, attachmentRefMap)
    : offlineSanitized;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(mapped)) {
    if (k === "attachmentBundle" || k === "attachmentZipManifest" || k === "backupOfflineFiles") continue;
    out[k] = stripAttachmentRefsForLocalCompanyRestore(mapped[k], restoredLocalRefs);
  }
  out.includesAttachments = mapped.includesAttachments;
  out.backupVersion = mapped.backupVersion;
  if (mapped.companyDetails !== undefined) {
    out.companyDetails = sanitizeCompanyDetailsForOfflineFileBackup(mapped.companyDetails);
  }
  return out;
}

export function countRemoteAttachmentRefsInBackupData(data: Record<string, unknown>): number {
  return collectAttachmentRefsFromBackupData(data).filter(isRemoteAttachmentRefForLocalCompany).length;
}

export function rewriteAttachmentRefsInValue(val: unknown, map: Map<string, string>): unknown {
  if (val == null) return val;
  if (typeof val === "string") {
    const next = lookupAttachmentRefInRestoreMap(map, val);
    return next ?? val;
  }
  if (Array.isArray(val)) return val.map((v) => rewriteAttachmentRefsInValue(v, map));
  if (typeof val === "object") {
    const o = val as Record<string, unknown>;
    if (typeof o.seconds === "number" && "nanoseconds" in o) return val;
    if (o.__fsTs === true) return val;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(o)) {
      out[k] = rewriteAttachmentRefsInValue(o[k], map);
    }
    return out;
  }
  return val;
}

/** SQLite-only backup: missing file URLs / dead refs hatao — available + pending refs rehne do. */
function stripListedAttachmentRefString(raw: string, remove: Set<string>): string | null {
  const t = String(raw || "").trim();
  if (!t) return null;
  if (remove.has(t)) return null;
  const norm = normalizeAttachmentUrlForDevicePreview(t);
  if (norm && remove.has(norm)) return null;
  if (t.startsWith("http://") || t.startsWith("https://")) {
    try {
      const u = new URL(t);
      if (remove.has(`${u.origin}${u.pathname}`)) return null;
    } catch {
      /* ignore */
    }
  }
  return t;
}

function stripListedAttachmentRefsInValue(val: unknown, remove: Set<string>, depth = 0): unknown {
  if (depth > 32) return val;
  if (val == null) return val;
  if (typeof val === "string") return stripListedAttachmentRefString(val, remove);
  if (Array.isArray(val)) {
    return val
      .map((item) => stripListedAttachmentRefsInValue(item, remove, depth + 1))
      .filter((item) => item != null && item !== "");
  }
  if (typeof val === "object") {
    const o = val as Record<string, unknown>;
    if (typeof o.seconds === "number" && "nanoseconds" in o) return val;
    if (o.__fsTs === true) return val;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(o)) {
      out[k] = stripListedAttachmentRefsInValue(o[k], remove, depth + 1);
    }
    return out;
  }
  return val;
}

export function stripListedAttachmentRefsFromBackupData(
  backupData: Record<string, unknown>,
  refsToRemove: Iterable<string>
): Record<string, unknown> {
  const remove = new Set<string>();
  for (const r of refsToRemove) {
    const t = String(r || "").trim();
    if (!t) continue;
    remove.add(t);
    const norm = normalizeAttachmentUrlForDevicePreview(t);
    if (norm) remove.add(norm);
  }
  if (remove.size === 0) return backupData;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(backupData)) {
    if (k === "attachmentBundle" || k === "attachmentZipManifest") {
      out[k] = backupData[k];
      continue;
    }
    out[k] = stripListedAttachmentRefsInValue(backupData[k], remove);
  }
  return out;
}

export function applyAttachmentRefMapToBackupData(
  backupData: Record<string, unknown>,
  map: Map<string, string>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(backupData)) {
    if (k === "attachmentBundle" || k === "attachmentZipManifest") continue;
    out[k] = rewriteAttachmentRefsInValue(backupData[k], map);
  }
  out.includesAttachments = backupData.includesAttachments;
  out.backupVersion = backupData.backupVersion;
  return out;
}
