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
import { isDriveFileRef } from "@/lib/legacyDriveFileRef";
import { linkFirebaseAttachmentRefs, touchRegistryAfterStorageUpload } from "@/lib/companyAttachmentRegistry";
import {
  appendLocalOnlyVoucherFilesToUrls,
  blobFromAttachmentRefForCopy,
  fileNameFromInterCompanyAttachmentRef,
  shouldStageNewVoucherFilesAsLocalPending,
} from "@/lib/voucherLocalAttachmentUpload";
import { patchVoucherFields } from "@/lib/voucherActionsClient";

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

async function copyOwnFilesToPeerIfShared(args: {
  share: boolean;
  ownFileUrls: string[];
  peerCompanyId: string;
  peerVoucherId: string;
  attachmentBlobByRef?: ReadonlyMap<string, Blob>;
}): Promise<{ copies: string[]; warning?: string }> {
  if (!args.share || args.ownFileUrls.length === 0) return { copies: [] };
  try {
    const copies = await resolveInterCompanyPeerAttachmentUrls({
      targetCompanyId: args.peerCompanyId,
      sourceFileUrls: args.ownFileUrls,
      targetVoucherId: args.peerVoucherId,
      attachmentBlobByRef: args.attachmentBlobByRef,
    });
    if (copies.length > 0) {
      const linkedSameUrls =
        copies.length === args.ownFileUrls.length &&
        copies.every((u, i) => u.trim() === args.ownFileUrls[i]!.trim());
      if (linkedSameUrls) {
        await linkFirebaseAttachmentRefs(args.peerCompanyId, copies);
      }
    }
    return { copies };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Could not copy attachment for the other company's own storage.";
    console.warn("[IC] attachment share copy:", err);
    return { copies: [], warning: message };
  }
}

/**
 * Dono taraf ka "apna" file set + har taraf ka share toggle — final combined `fileUrls`
 * (apna + jo peer ne share kiya) dono vouchers par patch. `interCompanyOwnFileUrls` se
 * agli baar edit khulne par sirf apna box hi apni files dikhaye (peer copy repeat na ho).
 */
export async function reconcileAndPatchInterCompanyAttachmentSharing(args: {
  sourceCompanyId: string;
  sourceVoucherId: string;
  sourceOwnFileUrls: string[];
  shareSourceToTarget: boolean;
  targetCompanyId: string;
  targetVoucherId: string;
  targetOwnFileUrls: string[];
  shareTargetToSource: boolean;
  sourceAttachmentBlobByRef?: ReadonlyMap<string, Blob>;
  targetAttachmentBlobByRef?: ReadonlyMap<string, Blob>;
}): Promise<{ attachmentReplicationWarning?: string }> {
  const sourceCompanyId = String(args.sourceCompanyId || "").trim();
  const sourceVoucherId = String(args.sourceVoucherId || "").trim();
  const targetCompanyId = String(args.targetCompanyId || "").trim();
  const targetVoucherId = String(args.targetVoucherId || "").trim();
  if (!sourceCompanyId || !sourceVoucherId || !targetCompanyId || !targetVoucherId) {
    throw new Error("Linked Inter Company voucher not found.");
  }

  const sourceOwnFileUrls = (args.sourceOwnFileUrls || []).filter(
    (u): u is string => typeof u === "string" && u.trim().length > 0
  );
  const targetOwnFileUrls = (args.targetOwnFileUrls || []).filter(
    (u): u is string => typeof u === "string" && u.trim().length > 0
  );

  const [toTarget, toSource] = await Promise.all([
    copyOwnFilesToPeerIfShared({
      share: args.shareSourceToTarget === true,
      ownFileUrls: sourceOwnFileUrls,
      peerCompanyId: targetCompanyId,
      peerVoucherId: targetVoucherId,
      attachmentBlobByRef: args.sourceAttachmentBlobByRef,
    }),
    copyOwnFilesToPeerIfShared({
      share: args.shareTargetToSource === true,
      ownFileUrls: targetOwnFileUrls,
      peerCompanyId: sourceCompanyId,
      peerVoucherId: sourceVoucherId,
      attachmentBlobByRef: args.targetAttachmentBlobByRef,
    }),
  ]);

  await patchVoucherFields(sourceCompanyId, sourceVoucherId, {
    interCompanyOwnFileUrls: sourceOwnFileUrls,
    interCompanyShareAttachmentsWithPeer: args.shareSourceToTarget === true,
    interCompanySharePeerAttachmentsToSource: args.shareTargetToSource === true,
    fileUrls: [...sourceOwnFileUrls, ...toSource.copies],
  });
  await patchVoucherFields(targetCompanyId, targetVoucherId, {
    interCompanyOwnFileUrls: targetOwnFileUrls,
    interCompanyShareAttachmentsWithPeer: args.shareSourceToTarget === true,
    interCompanySharePeerAttachmentsToSource: args.shareTargetToSource === true,
    fileUrls: [...targetOwnFileUrls, ...toTarget.copies],
  });

  const warning = toTarget.warning || toSource.warning;
  return warning ? { attachmentReplicationWarning: warning } : {};
}
