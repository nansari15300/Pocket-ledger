"use client";

import { prepareVoucherAttachmentsForSave } from "@/lib/attachmentRecompressOnSave";
import { readLockedPdfFileUrlsFromRow } from "@/lib/attachmentPdfOptions";
import {
  normalizeFormFileUrlsForSave,
  uploadVoucherAttachmentFileToFirebase,
} from "@/lib/voucherFormAttachmentSave";
import {
  appendLocalOnlyVoucherFilesToUrls,
  shouldDeferStorageIncrementUntilPendingUpload,
  shouldStageNewVoucherFilesAsLocalPending,
} from "@/lib/voucherLocalAttachmentUpload";
import { checkStorageLimit, incrementCompanyStorage } from "@/lib/storageUsageClient";

export type VoucherAttachmentsBeforeSaveResult = {
  fileUrls: string[];
  preGeneratedVoucherId?: string;
};

/**
 * Payment Out / Journal shared path: add-time compress → save par sirf zarurat par recompress → local stage ya Firebase upload.
 */
export async function resolveVoucherAttachmentsBeforeSave(params: {
  companyId: string;
  company: { planId?: string | null; storageOption?: string | null };
  files: (File | string)[];
  savePdfAsImage: boolean;
  lockedPdfSource?: Record<string, unknown> | null;
  storageFolder: string;
  maxFileCount: number;
  idArgForFirestore: string | null | undefined;
  isEditingAndConverting: boolean;
  voucherIdForFirebaseUpload?: string;
  onStorageLimitBlocked?: (message: string) => void;
}): Promise<VoucherAttachmentsBeforeSaveResult | null> {
  const filesForSave = await prepareVoucherAttachmentsForSave(params.files, {
    companyId: params.companyId,
    savePdfAsImage: params.savePdfAsImage,
    lockedPdfFileUrls: readLockedPdfFileUrlsFromRow(params.lockedPdfSource),
  });

  let fileUrls = normalizeFormFileUrlsForSave(
    filesForSave.filter((f): f is string => typeof f === "string")
  );
  let preGeneratedVoucherId: string | undefined;
  const newFilesToUpload = filesForSave.filter((f): f is File => f instanceof File);

  if (newFilesToUpload.length === 0) {
    return { fileUrls, preGeneratedVoucherId };
  }

  const totalNewBytes = newFilesToUpload.reduce((sum, f) => sum + (f.size || 0), 0);
  const limitCheck = await checkStorageLimit(
    params.companyId,
    params.company?.planId,
    { attachmentsBytes: totalNewBytes, storageBytes: totalNewBytes },
    params.company?.storageOption
  );
  if (!limitCheck.allowed) {
    params.onStorageLimitBlocked?.(limitCheck.message ?? "Storage limit reached");
    return null;
  }

  if (await shouldStageNewVoucherFilesAsLocalPending(params.companyId)) {
    const voucherIdForLocalAttachments = params.isEditingAndConverting ? null : params.idArgForFirestore ?? null;
    const { fileUrls: merged, preGeneratedVoucherId: preGen } = await appendLocalOnlyVoucherFilesToUrls({
      companyId: params.companyId,
      storageFolder: params.storageFolder,
      existingFileUrls: fileUrls,
      newFiles: newFilesToUpload,
      maxFileCount: params.maxFileCount,
      existingVoucherId: voucherIdForLocalAttachments,
    });
    fileUrls = merged;
    if (preGen) preGeneratedVoucherId = preGen;
    if (!shouldDeferStorageIncrementUntilPendingUpload()) {
      try {
        await incrementCompanyStorage(params.companyId, {
          attachmentsBytes: totalNewBytes,
          storageBytes: totalNewBytes,
        });
      } catch {
        /* offline / local company */
      }
    }
  } else {
    for (const file of newFilesToUpload) {
      if (fileUrls.length >= params.maxFileCount) break;
      const url = await uploadVoucherAttachmentFileToFirebase({
        companyId: params.companyId,
        voucherType: params.storageFolder,
        file,
        voucherId: params.voucherIdForFirebaseUpload,
      });
      fileUrls.push(url);
      await incrementCompanyStorage(params.companyId, {
        attachmentsBytes: file.size,
        storageBytes: file.size,
      });
    }
  }

  return { fileUrls, preGeneratedVoucherId };
}
