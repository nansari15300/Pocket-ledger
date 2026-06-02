"use client";

/**
 * Inter Company — source attachments ko target company ke apne refs me copy karo
 * taaki peer side `local:` / apni storage se open ho sake.
 */
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "@/lib/firebase";
import { incrementCompanyStorage } from "@/lib/storageUsageClient";
import { fetchAttachmentRefBlob } from "@/lib/attachmentRefBlobFetch";
import { interCompanyLinkAttachmentsWithoutCopy } from "@/lib/firebaseBillingOptimization";
import { isLocalFileRef } from "@/lib/localPendingFiles";
import { isDriveFileRef } from "@/lib/localCloudSync/pocketLedgerDrivePaths";
import { touchRegistryAfterStorageUpload } from "@/lib/companyAttachmentRegistry";
import {
  appendLocalOnlyVoucherFilesToUrls,
  blobFromAttachmentRefForCopy,
  fileNameFromInterCompanyAttachmentRef,
  shouldStageNewVoucherFilesAsLocalPending,
} from "@/lib/voucherLocalAttachmentUpload";

function attachmentRefsCanLinkWithoutCopy(urls: string[]): boolean {
  if (!interCompanyLinkAttachmentsWithoutCopy()) return false;
  if (urls.length === 0) return false;
  return urls.every((u) => {
    const refStr = u.trim();
    if (!refStr) return false;
    if (isLocalFileRef(refStr) || isDriveFileRef(refStr)) return false;
    return refStr.startsWith("http://") || refStr.startsWith("https://");
  });
}

/**
 * IC peer side: same HTTPS URLs when safe (no Storage duplicate); otherwise full copy.
 */
export async function resolveInterCompanyPeerAttachmentUrls(args: {
  targetCompanyId: string;
  sourceFileUrls: string[];
  targetVoucherId: string;
  attachmentBlobByRef?: ReadonlyMap<string, Blob>;
}): Promise<string[]> {
  const sourceFileUrls = (args.sourceFileUrls || []).filter(
    (u): u is string => typeof u === "string" && u.trim().length > 0
  );
  if (sourceFileUrls.length === 0) return [];
  if (attachmentRefsCanLinkWithoutCopy(sourceFileUrls)) {
    return [...sourceFileUrls];
  }
  return replicateInterCompanySharedAttachmentsToPeer(args);
}

async function blobForInterCompanyPeerCopy(
  srcRef: string,
  blobByRef?: ReadonlyMap<string, Blob>
): Promise<Blob | null> {
  const ref = srcRef.trim();
  if (!ref) return null;
  const staged = blobByRef?.get(ref);
  if (staged && staged.size > 0) return staged;
  const viaPreview = await fetchAttachmentRefBlob(ref, { galleryUrls: blobByRef ? [...blobByRef.keys()] : undefined });
  if (viaPreview && viaPreview.size > 0) return viaPreview;
  const viaCopy = await blobFromAttachmentRefForCopy(ref);
  if (viaCopy && viaCopy.size > 0) return viaCopy;
  return null;
}

export async function replicateInterCompanySharedAttachmentsToPeer(args: {
  targetCompanyId: string;
  sourceFileUrls: string[];
  targetVoucherId: string;
  /** Save ke waqt abhi memory / IndexedDB me maujood blobs — dubara read fail hone par fallback */
  attachmentBlobByRef?: ReadonlyMap<string, Blob>;
}): Promise<string[]> {
  const targetCompanyId = String(args.targetCompanyId || "").trim();
  const targetVoucherId = String(args.targetVoucherId || "").trim();
  const sourceFileUrls = (args.sourceFileUrls || []).filter(
    (u): u is string => typeof u === "string" && u.trim().length > 0
  );
  if (!targetCompanyId || !targetVoucherId || sourceFileUrls.length === 0) return [];

  const staged: { blob: Blob; fileName: string }[] = [];
  for (let i = 0; i < sourceFileUrls.length; i++) {
    const srcRef = sourceFileUrls[i]!.trim();
    const blob = await blobForInterCompanyPeerCopy(srcRef, args.attachmentBlobByRef);
    if (!blob || blob.size <= 0) {
      throw new Error(
        "Could not copy attachment for the other company's own storage. The voucher is saved — other side may still preview via the linked copy. Open the file once on this device, then save again to attach locally there."
      );
    }
    staged.push({
      blob,
      fileName: fileNameFromInterCompanyAttachmentRef(srcRef, i + 1, blob.type),
    });
  }

  if (await shouldStageNewVoucherFilesAsLocalPending(targetCompanyId)) {
    const newFiles = staged.map(
      ({ blob, fileName }) =>
        new File([blob], fileName, { type: blob.type || "application/octet-stream" })
    );
    const { fileUrls } = await appendLocalOnlyVoucherFilesToUrls({
      companyId: targetCompanyId,
      storageFolder: "inter_company",
      existingFileUrls: [],
      newFiles,
      maxFileCount: Math.max(newFiles.length, 20),
      existingVoucherId: targetVoucherId,
    });
    return fileUrls;
  }

  const out: string[] = [];
  for (const { blob, fileName } of staged) {
    const objectPath = `voucher-files/${targetCompanyId}/inter_company/${Date.now()}_${fileName}`;
    const storageRef = ref(storage, objectPath);
    await uploadBytes(storageRef, blob, {
      contentType: blob.type || "application/octet-stream",
    });
    const httpsUrl = await getDownloadURL(storageRef);
    out.push(httpsUrl);
    try {
      await incrementCompanyStorage(targetCompanyId, {
        attachmentsBytes: blob.size,
        storageBytes: blob.size,
      });
      await touchRegistryAfterStorageUpload(targetCompanyId, httpsUrl);
    } catch {
      /* usage counter non-fatal */
    }
  }
  return out;
}
