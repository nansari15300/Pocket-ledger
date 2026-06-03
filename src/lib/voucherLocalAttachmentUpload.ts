"use client";

/**
 * Local/static company: nayi files Firebase Storage ke bina — IndexedDB blob + voucher JSON me `local:uuid` ref.
 * SQLite `company_docs` me URLs string ke roop me; actual bytes `offlineDb` pendingFiles store me.
 */
import { generateLocalVoucherIdForCreate } from "@/lib/localEntityIds";
import {
  generateLocalFileId,
  getBlobFromLocalFileRef,
  LOCAL_FILE_PREFIX,
  isLocalFileRef,
  putPendingFile,
  resolvePendingAttachmentCloudSyncProvider,
} from "@/lib/localPendingFiles";
import { apkCloudCompanyUsesSqliteFirstWrites, isClientNavigatorOffline } from "@/lib/apkOnlineFirestoreWritePolicy";
import { isOfflineCompanyStorage } from "@/lib/companyUnlockGate";
import { getLocalCompanyById } from "@/lib/localCompanyStore";
import { getRemoteAttachmentBlobPreferOfflineCache } from "@/lib/offlineAttachmentUrlCache";
import { isDriveFileRef } from "@/lib/localCloudSync/pocketLedgerDrivePaths";
import { tryGetStoragePathFromFirebaseDownloadUrl } from "@/lib/firebaseStorageDownloadUrl";

const ATTACHMENT_HOLD_CLIPBOARD_PREFIX = "PL_ATTACH_V1:";

function decodeAttachmentHoldMarkerToLocalRef(raw: string): string | null {
  const s = String(raw || "").trim();
  if (!s.startsWith(ATTACHMENT_HOLD_CLIPBOARD_PREFIX)) return null;
  const b64 = s.slice(ATTACHMENT_HOLD_CLIPBOARD_PREFIX.length);
  try {
    const json = decodeURIComponent(escape(atob(b64)));
    const obj = JSON.parse(json) as { src?: unknown };
    const src = typeof obj?.src === "string" ? obj.src.trim() : "";
    // Legacy marker payload should still be treated like `local:` for pending upload detection.
    return isLocalFileRef(src) ? src : null;
  } catch {
    return null;
  }
}

function isPendingLocalAttachmentRef(value: unknown): boolean {
  if (typeof value !== "string") return false;
  if (isLocalFileRef(value)) return true;
  return decodeAttachmentHoldMarkerToLocalRef(value) != null;
}

function fileNameFromAttachmentRef(ref: string, fallbackIndex: number, contentType?: string): string {
  const storagePath = tryGetStoragePathFromFirebaseDownloadUrl(ref);
  const fromPath = storagePath?.split("/").pop()?.trim();
  if (fromPath) return fromPath;
  try {
    const u = new URL(ref);
    const base = decodeURIComponent((u.pathname.split("/").pop() || "").split("?")[0] || "");
    if (base && !/^o$/i.test(base)) return base;
  } catch {
    /* local/drive refs fall through to content-type extension */
  }
  const ct = String(contentType || "").toLowerCase();
  const ext = ct.includes("pdf")
    ? "pdf"
    : ct.includes("png")
      ? "png"
      : ct.includes("webp")
        ? "webp"
        : ct.includes("jpeg") || ct.includes("jpg")
          ? "jpg"
          : "bin";
  return `copied_attachment_${fallbackIndex}.${ext}`;
}

export function fileNameFromInterCompanyAttachmentRef(
  ref: string,
  fallbackIndex: number,
  contentType?: string
): string {
  return fileNameFromAttachmentRef(ref, fallbackIndex, contentType);
}

export async function blobFromAttachmentRefForCopy(
  ref: string,
  options?: { companyId?: string; galleryUrls?: readonly string[] }
): Promise<Blob | null> {
  if (isLocalFileRef(ref) || isDriveFileRef(ref)) {
    const { getRemoteAttachmentBlobPreferOfflineCache } = await import("@/lib/offlineAttachmentUrlCache");
    return getRemoteAttachmentBlobPreferOfflineCache(ref, undefined, {
      galleryUrls: options?.galleryUrls,
      companyId: options?.companyId,
    });
  }
  if (/^https?:\/\//i.test(ref)) {
    const { getRemoteAttachmentBlobPreferOfflineCache } = await import("@/lib/offlineAttachmentUrlCache");
    return getRemoteAttachmentBlobPreferOfflineCache(ref);
  }
  return null;
}

/** Copy To: local (`storageOption: local`) target par Firebase/HTTPS refs ko File me — save par `local:` stage hoga. */
export async function importVoucherAttachmentsAsFilesForLocalCloudCopy<T extends Record<string, unknown>>(params: {
  targetCompanyId: string;
  /** Source voucher company — `drive:` download Google Drive resolve ke liye. */
  sourceCompanyId?: string;
  voucher: T;
}): Promise<{ voucher: T; importedCount: number }> {
  const targetReg = await getLocalCompanyById(params.targetCompanyId);
  // Sirf device-local company — cloud Firebase company me purane HTTPS URL pass-through theek hai.
  if (!targetReg || !isOfflineCompanyStorage(targetReg as { storageOption?: string })) {
    return { voucher: params.voucher, importedCount: 0 };
  }
  if (typeof File === "undefined") return { voucher: params.voucher, importedCount: 0 };

  const source = params.voucher;
  const sourceCompanyId = String(params.sourceCompanyId || "").trim() || undefined;
  const rawUrls = Array.isArray(source.fileUrls) ? source.fileUrls : [];
  const galleryUrls = rawUrls.filter((u): u is string => typeof u === "string");
  const unassigned = source.unassignedFile && typeof source.unassignedFile === "object"
    ? (source.unassignedFile as Record<string, unknown>)
    : null;
  const unassignedUrl = typeof unassigned?.url === "string" ? unassigned.url.trim() : "";
  const entries = [...rawUrls, ...(unassignedUrl ? [unassignedUrl] : [])];
  const importedFiles: File[] = [];
  const preserved: unknown[] = [];
  const seenRefs = new Set<string>();

  for (const entry of entries) {
    if (entry instanceof File) {
      importedFiles.push(entry);
      continue;
    }
    const ref = typeof entry === "string" ? entry.trim() : "";
    if (!ref) continue;
    if (seenRefs.has(ref)) continue;
    seenRefs.add(ref);
    const blob = await blobFromAttachmentRefForCopy(ref, {
      companyId: sourceCompanyId,
      galleryUrls,
    });
    if (!blob || blob.size <= 0) {
      throw new Error("Could not download copied voucher attachment. Open the file once or reconnect internet, then try Copy To again.");
    }
    const fileName = fileNameFromAttachmentRef(ref, importedFiles.length + 1, blob.type);
    importedFiles.push(new File([blob], fileName, { type: blob.type || "application/octet-stream" }));
  }

  for (const entry of rawUrls) {
    if (entry instanceof File) continue;
    const ref = typeof entry === "string" ? entry.trim() : "";
    // Non-attachment strings stay untouched; remote/local refs were imported as Files above.
    if (!ref || isLocalFileRef(ref) || isDriveFileRef(ref) || /^https?:\/\//i.test(ref)) continue;
    preserved.push(entry);
  }

  if (importedFiles.length === 0) return { voucher: source, importedCount: 0 };
  return {
    voucher: {
      ...source,
      fileUrls: [...preserved, ...importedFiles],
      // Copied unassigned URL becomes normal pending attachment so original Firebase link is not re-added on save.
      unassignedFile: unassignedUrl ? null : source.unassignedFile,
    },
    importedCount: importedFiles.length,
  };
}

function isFirebaseOrHttpsAttachmentRef(ref: string): boolean {
  if (!ref) return false;
  if (/^https?:\/\//i.test(ref)) return true;
  return !!tryGetStoragePathFromFirebaseDownloadUrl(ref);
}

/** SQLite/local save se pehle: galati se bachi Firebase Storage URL ko `local:` pending me badlo. */
export async function rewriteRemoteVoucherAttachmentsForOfflineCompany(
  companyId: string,
  data: Record<string, unknown>,
  existingVoucherId: string | null
): Promise<void> {
  const reg = await getLocalCompanyById(companyId);
  if (!reg || !isOfflineCompanyStorage(reg as { storageOption?: string })) return;

  const storageFolder = String(data.type || "journal").trim() || "journal";
  const rawUrls = Array.isArray(data.fileUrls) ? data.fileUrls : [];
  const keepUrls: string[] = [];
  const downloadRefs: string[] = [];
  const seen = new Set<string>();

  for (const entry of rawUrls) {
    if (entry instanceof File) continue;
    const ref = typeof entry === "string" ? entry.trim() : "";
    if (!ref) continue;
    if (isLocalFileRef(ref) || isDriveFileRef(ref)) {
      keepUrls.push(ref);
      continue;
    }
    if (isFirebaseOrHttpsAttachmentRef(ref)) {
      if (!seen.has(ref)) {
        seen.add(ref);
        downloadRefs.push(ref);
      }
      continue;
    }
    keepUrls.push(ref);
  }

  const uf = data.unassignedFile;
  let unassignedRemote: string | null = null;
  if (uf && typeof uf === "object" && uf !== null) {
    const urlStr = typeof (uf as Record<string, unknown>).url === "string" ? String((uf as Record<string, unknown>).url).trim() : "";
    if (urlStr && isFirebaseOrHttpsAttachmentRef(urlStr) && !seen.has(urlStr)) {
      seen.add(urlStr);
      unassignedRemote = urlStr;
      downloadRefs.push(urlStr);
    } else if (urlStr && !isFirebaseOrHttpsAttachmentRef(urlStr)) {
      /* local/drive unassigned — rehne do */
    }
  }

  if (downloadRefs.length === 0) return;

  const newFiles: File[] = [];
  for (const ref of downloadRefs) {
    const blob = await blobFromAttachmentRefForCopy(ref, { companyId });
    if (!blob || blob.size <= 0) {
      throw new Error(
        "Could not download voucher attachment for local save. Open the file once while online, then save again."
      );
    }
    const fileName = fileNameFromAttachmentRef(ref, newFiles.length + 1, blob.type);
    newFiles.push(new File([blob], fileName, { type: blob.type || "application/octet-stream" }));
  }

  const maxFileCount = Math.max(keepUrls.length + newFiles.length, 20);
  const staged = await appendLocalOnlyVoucherFilesToUrls({
    companyId,
    storageFolder,
    existingFileUrls: keepUrls,
    newFiles,
    maxFileCount,
    existingVoucherId,
  });
  data.fileUrls = staged.fileUrls;
  if (unassignedRemote) data.unassignedFile = null;
}

/**
 * Legacy rollback: `NEXT_PUBLIC_VOUCHER_ATTACHMENT_FIRESTORE_IMMEDIATE_UPLOAD=1` → purana flow (online + Firestore-first par form `uploadBytes` await).
 * Default: false — nayi files hamesha `local:` + IndexedDB, `saveVoucher` blocking hydrate skip (background `syncPendingFiles`).
 */
export function voucherAttachmentFirestoreImmediateUploadEnabled(): boolean {
  return (
    typeof process !== "undefined" &&
    String(process.env.NEXT_PUBLIC_VOUCHER_ATTACHMENT_FIRESTORE_IMMEDIATE_UPLOAD || "").trim() === "1"
  );
}

/** Single product gate: immediate Storage upload on save off unless legacy env above. */
export function voucherNewAttachmentsAlwaysStageAsLocalPending(): boolean {
  return !voucherAttachmentFirestoreImmediateUploadEnabled();
}

/** `saveVoucher` / `patchVoucherFields`: payload me `local:` ho to blocking `hydrateVoucherLocalAttachmentsForServer` skip kar sakte ho (setDoc id + `syncPendingFiles`). */
export function recordContainsLocalPendingVoucherFileRef(obj: Record<string, unknown>): boolean {
  const urls = obj.fileUrls;
  if (Array.isArray(urls)) {
    for (const u of urls) {
      if (isPendingLocalAttachmentRef(u)) return true;
    }
  }
  const uf = obj.unassignedFile;
  if (uf && typeof uf === "object" && uf !== null) {
    const urlStr = (uf as Record<string, unknown>).url;
    if (isPendingLocalAttachmentRef(urlStr)) return true;
  }
  return false;
}

export async function appendLocalOnlyVoucherFilesToUrls(params: {
  companyId: string;
  /** `voucher-files/${companyId}/${storageFolder}/...` — sale, purchase, journal, payment_in, ... */
  storageFolder: string;
  existingFileUrls: string[];
  newFiles: File[];
  maxFileCount: number;
  /** Edit par existing id; create par null — tab naya voucher id yahi generate hoga */
  existingVoucherId: string | null;
}): Promise<{ fileUrls: string[]; preGeneratedVoucherId?: string }> {
  const { companyId, storageFolder, existingFileUrls, newFiles, maxFileCount, existingVoucherId } = params;
  const out = [...existingFileUrls];
  if (newFiles.length === 0) return { fileUrls: out };

  const voucherIdForDoc = existingVoucherId || generateLocalVoucherIdForCreate();
  const preGeneratedVoucherId = existingVoucherId ? undefined : voucherIdForDoc;

  for (const file of newFiles) {
    if (out.length >= maxFileCount) break;
    const localFileId = generateLocalFileId();
    await putPendingFile({
      id: localFileId,
      blob: file,
      contentType: file.type || "application/octet-stream",
      docPath: `companies/${companyId}/vouchers/${voucherIdForDoc}`,
      field: "fileUrls",
      storagePathPrefix: `voucher-files/${companyId}/${storageFolder}`,
      fileName: file.name,
    });
    out.push(`${LOCAL_FILE_PREFIX}${localFileId}`);
  }
  return { fileUrls: out, preGeneratedVoucherId };
}

/**
 * Voucher forms: nayi `File` — `appendLocalOnlyVoucherFilesToUrls` vs Storage `uploadBytes`.
 * Default (`voucherNewAttachmentsAlwaysStageAsLocalPending`): hamesha local stage — online + Server writes ON par bhi form `uploadBytes` await nahi.
 * Legacy env `NEXT_PUBLIC_VOUCHER_ATTACHMENT_FIRESTORE_IMMEDIATE_UPLOAD=1` par sirf offline / sqlite-first par stage (purana UX).
 */
export async function shouldStageNewVoucherFilesAsLocalPending(companyId: string): Promise<boolean> {
  // Local company me Google Drive selected ho to form se Firebase Storage direct upload kabhi mat karo.
  if (await resolvePendingAttachmentCloudSyncProvider(companyId)) return true;
  if (voucherNewAttachmentsAlwaysStageAsLocalPending()) return true;
  if (isClientNavigatorOffline()) return true;
  return apkCloudCompanyUsesSqliteFirstWrites(String(companyId || "").trim());
}

/**
 * `local:` + IndexedDB stage: usage counter `syncPendingFiles` / hydrate upload par —
 * save ke waqt `incrementCompanyStorage` await se "Saving…" mat atkao.
 */
export function shouldDeferStorageIncrementUntilPendingUpload(): boolean {
  return voucherNewAttachmentsAlwaysStageAsLocalPending();
}
