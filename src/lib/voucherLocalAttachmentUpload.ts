"use client";

/**
 * Local/static company: nayi files Firebase Storage ke bina — IndexedDB blob + voucher JSON me `local:uuid` ref.
 * SQLite `company_docs` me URLs string ke roop me; actual bytes `offlineDb` pendingFiles store me.
 */
import { generateLocalVoucherIdForCreate } from "@/lib/localEntityIds";
import { generateLocalFileId, LOCAL_FILE_PREFIX, putPendingFile } from "@/lib/localPendingFiles";

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
