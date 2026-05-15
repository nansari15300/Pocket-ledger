"use client";

/**
 * Local/static company: nayi files Firebase Storage ke bina — IndexedDB blob + voucher JSON me `local:uuid` ref.
 * SQLite `company_docs` me URLs string ke roop me; actual bytes `offlineDb` pendingFiles store me.
 */
import { generateLocalVoucherIdForCreate } from "@/lib/localEntityIds";
import { generateLocalFileId, LOCAL_FILE_PREFIX, isLocalFileRef, putPendingFile } from "@/lib/localPendingFiles";
import { apkCloudCompanyUsesSqliteFirstWrites, isClientNavigatorOffline } from "@/lib/apkOnlineFirestoreWritePolicy";

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
      if (typeof u === "string" && isLocalFileRef(u)) return true;
    }
  }
  const uf = obj.unassignedFile;
  if (uf && typeof uf === "object" && uf !== null) {
    const urlStr = (uf as Record<string, unknown>).url;
    if (typeof urlStr === "string" && isLocalFileRef(urlStr)) return true;
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
  let out = [...existingFileUrls];
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
  if (voucherNewAttachmentsAlwaysStageAsLocalPending()) return true;
  if (isClientNavigatorOffline()) return true;
  return apkCloudCompanyUsesSqliteFirstWrites(String(companyId || "").trim());
}
