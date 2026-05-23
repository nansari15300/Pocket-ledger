"use client";

import {
  generateLocalFileId,
  getBlobFromLocalFileRef,
  getPendingPayloadForLocalRef,
  isLocalFileRef,
  LOCAL_FILE_PREFIX,
  putPendingFile,
} from "@/lib/localPendingFiles";
import { getRemoteAttachmentBlobPreferOfflineCache } from "@/lib/offlineAttachmentUrlCache";

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
/** Parallel attachment read — backup tez; zyada par network saturate na ho. */
const BACKUP_ATTACH_CONCURRENCY = 4;

/** String attachment ref — local pending ya remote URL. */
export function isAttachmentRefString(v: unknown): v is string {
  if (typeof v !== "string" || !v.trim()) return false;
  return isLocalFileRef(v) || HTTPS_REF.test(v);
}

/** Backup JSON me saari unique attachment refs collect — nested doc fields scan. */
export function collectAttachmentRefsFromValue(val: unknown, out: Set<string>): void {
  if (val == null) return;
  if (typeof val === "string") {
    if (isAttachmentRefString(val)) out.add(val);
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
      k === "backupVersion"
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

/** Backup embed: preview/open jaisa resolve — IndexedDB cache + Firebase SDK (sirf CORS fetch nahi). */
async function resolveAttachmentBlobForBackup(ref: string, signal?: AbortSignal): Promise<Blob | null> {
  if (signal?.aborted) return null;
  if (isLocalFileRef(ref)) {
    const item = await getPendingPayloadForLocalRef(ref);
    if (item?.blob && item.blob.size > 0) return item.blob;
    return await getBlobFromLocalFileRef(ref);
  }
  if (!HTTPS_REF.test(ref)) return null;
  // Offline cache + Firebase `getBlob` + Electron proxy — voucher preview wahi chain.
  return await getRemoteAttachmentBlobPreferOfflineCache(ref, signal);
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
    if (ct.includes("jpeg") || ct.includes("jpg")) ext = ".jpg";
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
export async function probeAttachmentRefForBackup(ref: string, signal?: AbortSignal): Promise<boolean> {
  try {
    const blob = await resolveAttachmentBlobForBackup(ref, signal);
    return !!(blob && blob.size > 0);
  } catch {
    return false;
  }
}

/** Har ref ke liye bytes resolve karke bundle banao — fail refs skip (data-only URLs reh sakti hain). */
export async function buildAttachmentBundleFromRefs(
  refs: string[],
  onProgress?: (done: number, total: number, bytesAdded: number) => void,
  signal?: AbortSignal
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
      blob = await resolveAttachmentBlobForBackup(key, signal);
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
          const blob = await resolveAttachmentBlobForBackup(key, signal);
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
  if (!data?.includesAttachments) return false;
  const zipMan = data.attachmentZipManifest as AttachmentZipManifest | undefined;
  if (Array.isArray(zipMan?.entries) && zipMan.entries.length > 0) return true;
  const bundle = data.attachmentBundle as AttachmentBundle | undefined;
  return Array.isArray(bundle?.entries) && bundle.entries.length > 0;
}

/** Restore warning: tick/URL backup me hai lekin `.plbp` me file bytes embed nahi (purana ya failed backup). */
export function backupDataHasOrphanAttachmentRefs(data: Record<string, unknown> | null | undefined): boolean {
  if (!data) return false;
  if (backupDataHasAttachmentBundle(data)) return false;
  return collectAttachmentRefsFromBackupData(data).length > 0;
}

/** Restore: bundle se pending `local:` files + purane ref → naya ref map. */
export async function restoreAttachmentBundleToLocalRefs(
  bundle: AttachmentBundle,
  targetCompanyId: string,
  onProgress?: (done: number, total: number, bytesAdded: number) => void,
  signal?: AbortSignal
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const prefix = `companies/${targetCompanyId}/restored-files`;
  const docPath = `companies/${targetCompanyId}/restored`;
  const entries = (bundle.entries || []).filter((e) => e?.key && e.dataBase64);
  const total = entries.length;
  let done = 0;
  for (const entry of entries) {
    if (signal?.aborted) throw new DOMException("Restore cancelled", "AbortError");
    try {
      const blob = base64ToBlob(entry.dataBase64, entry.contentType);
      const id = generateLocalFileId();
      await putPendingFile({
        id,
        blob,
        contentType: entry.contentType || blob.type || "application/octet-stream",
        docPath,
        field: "fileUrls",
        storagePathPrefix: prefix,
        fileName: entry.fileName || `restored_${id.slice(0, 8)}`,
      });
      map.set(entry.key, `${LOCAL_FILE_PREFIX}${id}`);
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
  signal?: AbortSignal
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const prefix = `companies/${targetCompanyId}/restored-files`;
  const docPath = `companies/${targetCompanyId}/restored`;
  const entries = (manifest.entries || []).filter((e) => e?.key && e.zipPath);
  const total = entries.length;
  let done = 0;
  for (const entry of entries) {
    if (signal?.aborted) throw new DOMException("Restore cancelled", "AbortError");
    try {
      const bytes = filesByPath.get(entry.zipPath);
      if (!bytes?.length) throw new Error("zip entry missing");
      const blob = new Blob([bytes as BlobPart], { type: entry.contentType || "application/octet-stream" });
      const id = generateLocalFileId();
      await putPendingFile({
        id,
        blob,
        contentType: entry.contentType || blob.type || "application/octet-stream",
        docPath,
        field: "fileUrls",
        storagePathPrefix: prefix,
        fileName: entry.fileName || `restored_${id.slice(0, 8)}`,
      });
      map.set(entry.key, `${LOCAL_FILE_PREFIX}${id}`);
      done += 1;
      onProgress?.(done, total, entry.size ?? blob.size);
    } catch (e) {
      console.warn("[attachmentRestoreZip] skip entry", entry.key, e);
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
  const zipMan = backupData.attachmentZipManifest as AttachmentZipManifest | undefined;
  if (Array.isArray(zipMan?.entries) && zipMan.entries.length > 0 && zipFilesByPath) {
    return restoreAttachmentZipToLocalRefs(zipMan, zipFilesByPath, targetCompanyId, onProgress, signal);
  }
  const bundle = backupData.attachmentBundle as AttachmentBundle | undefined;
  if (Array.isArray(bundle?.entries) && bundle.entries.length > 0) {
    return restoreAttachmentBundleToLocalRefs(bundle, targetCompanyId, onProgress, signal);
  }
  return new Map();
}

/** Replace attachment refs deep in backup payload before SQLite/Firestore write. */
export function rewriteAttachmentRefsInValue(val: unknown, map: Map<string, string>): unknown {
  if (val == null) return val;
  if (typeof val === "string") {
    const next = map.get(val);
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
