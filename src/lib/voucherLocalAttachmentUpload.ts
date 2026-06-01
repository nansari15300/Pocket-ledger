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

async function blobFromAttachmentRefForCopy(ref: string): Promise<Blob | null> {
  if (isLocalFileRef(ref) || isDriveFileRef(ref)) {
    // Local/Drive refs already use app-aware readers; copy target should still get its own fresh File.
    return await getBlobFromLocalFileRef(ref);
  }
  if (/^https?:\/\//i.test(ref)) {
    // Firebase URL ko SDK/cache/fetch chain se Blob banao; raw URL target company me carry mat karo.
    return await getRemoteAttachmentBlobPreferOfflineCache(ref);
  }
  return null;
}

/** Copy To: selected local cloud provider ho to source URL refs ko File blobs me convert karo. */
export async function importVoucherAttachmentsAsFilesForLocalCloudCopy<T extends Record<string, unknown>>(params: {
  targetCompanyId: string;
  voucher: T;
}): Promise<{ voucher: T; importedCount: number }> {
  const provider = await resolvePendingAttachmentCloudSyncProvider(params.targetCompanyId);
  if (!provider) return { voucher: params.voucher, importedCount: 0 };
  if (typeof File === "undefined") return { voucher: params.voucher, importedCount: 0 };

  const source = params.voucher;
  const rawUrls = Array.isArray(source.fileUrls) ? source.fileUrls : [];
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
    const blob = await blobFromAttachmentRefForCopy(ref);
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
  // Local company me Drive/Dropbox selected ho to form se Firebase Storage direct upload kabhi mat karo.
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
