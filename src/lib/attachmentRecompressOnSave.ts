"use client";

/**
 * Edit/create Save: existing image URLs + new image Files over company cap
 * (Online 100KB / Local·PL·Drive 150KB) → recompress to File for re-upload.
 */
import { toast as sonnerToast } from "sonner";
import { compressVoucherAttachment } from "@/lib/compression";
import { sniffBlobKindForPreview } from "@/lib/attachmentFormatLabel";
import { getBlobFromLocalFileRef, isLocalFileRef } from "@/lib/localPendingFiles";
import { getRemoteAttachmentBlobPreferOfflineCache } from "@/lib/offlineAttachmentUrlCache";
import {
  convertPdfAttachmentsToJpegIfEnabled,
  looksLikePdfAttachmentUrl,
  shouldSuggestPdfAsImage,
} from "@/lib/voucherAttachmentPdfAsImage";

function isImageFile(f: File): boolean {
  const t = (f.type || "").toLowerCase();
  if (t.startsWith("image/")) return true;
  return /\.(jpe?g|png|gif|webp|bmp|heic|heif|avif|tiff?)$/i.test(f.name || "");
}

export function looksLikeImageAttachmentUrl(url: string): boolean {
  const low = String(url || "").toLowerCase();
  if (!low) return false;
  if (looksLikePdfAttachmentUrl(url)) return false;
  if (low.includes("image%2f") || low.includes("image/")) return true;
  const path = low.split("?")[0] || "";
  if (/\.(jpe?g|png|gif|webp|bmp|heic|heif|avif|tiff?)$/.test(path)) return true;
  // `local:` / drive — blob sniff decide karega (size known after local read).
  if (isLocalFileRef(url) || low.startsWith("drive:")) return true;
  // HTTPS without image MIME/extension: full download mat (edit Save hang).
  return false;
}

async function loadAttachmentBlob(
  url: string,
  opts?: { companyId?: string | null }
): Promise<Blob | null> {
  const trimmed = String(url || "").trim();
  if (!trimmed) return null;

  if (isLocalFileRef(trimmed)) {
    let blob = await getBlobFromLocalFileRef(trimmed);
    if (!blob || blob.size === 0) {
      const { readActiveAttachmentCompanyId } = await import("@/lib/firestorePermissionSuppress");
      const cid = opts?.companyId?.trim() || readActiveAttachmentCompanyId() || undefined;
      if (cid) {
        const { resolvePlServerStaffAttachmentPreviewBlob } = await import(
          "@/lib/plServerAttachmentFetch"
        );
        blob = await resolvePlServerStaffAttachmentPreviewBlob(trimmed, { companyId: cid });
      }
    }
    return blob && blob.size > 0 ? blob : null;
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    let blob = await getRemoteAttachmentBlobPreferOfflineCache(trimmed, undefined, {
      companyId: opts?.companyId,
      explicitUserRequest: true,
    });
    if (!blob || blob.size === 0) {
      try {
        const res = await fetch(trimmed, { mode: "cors" });
        if (!res.ok) return null;
        blob = await res.blob();
      } catch {
        return null;
      }
    }
    return blob && blob.size > 0 ? blob : null;
  }

  if (trimmed.startsWith("drive:")) {
    try {
      const { fetchAttachmentRefBlob } = await import("@/lib/attachmentRefBlobFetch");
      const { readActiveAttachmentCompanyId } = await import("@/lib/firestorePermissionSuppress");
      const cid = opts?.companyId?.trim() || readActiveAttachmentCompanyId() || undefined;
      const blob = await fetchAttachmentRefBlob(trimmed, { companyId: cid });
      return blob && blob.size > 0 ? blob : null;
    } catch {
      return null;
    }
  }

  return null;
}

function fileNameForCompressedImage(urlOrName: string, contentType: string): string {
  const base =
    String(urlOrName || "image")
      .split(/[\\/]/)
      .pop()
      ?.split("?")[0] || "image";
  const stem = base.replace(/\.[a-z0-9]+$/i, "") || "image";
  const t = (contentType || "").toLowerCase();
  if (t.includes("png")) return `${stem}.png`;
  if (t.includes("webp")) return `${stem}.webp`;
  return `${stem}.jpg`;
}

/**
 * Shared HTTPS (source already in company / paste reuse):
 * over cap → compress → new upload → rewrite ALL places (source included) → delete old.
 * Never returns a File for shared refs (File = fork → alag URL / alag badge).
 * Under cap / not cloud / fail → original URL (shared link rahe).
 *
 * Simple product rule (online + offline reuse):
 * - New add / reuse: same bytes (same URL) on every voucher.
 * - Edit oversized reused: compress once → new URL everywhere → delete old (storage save).
 */
export async function ensureSharedHttpsAttachmentCompressed(params: {
  companyId?: string | null;
  fromUrl: string;
  /** Already-compressed image; omit to load+compress inside. */
  compressed?: File;
  silent?: boolean;
}): Promise<string> {
  const cid = String(params.companyId || "").trim();
  const fromUrl = String(params.fromUrl || "").trim();
  if (!cid || !/^https?:\/\//i.test(fromUrl)) return fromUrl;

  try {
    // NOTE: `shouldStageNewVoucherFilesAsLocalPending` yahan mat use karo.
    // Online SQLite-first pe woh true hota hai (nayi File → local: stage),
    // lekin shared HTTPS over Online 100KB / EXE 150KB pe Firebase
    // upload + company-wide rewrite chahiye.

    const { isFirebaseLedgerDataSyncDisabled } = await import(
      "@/lib/firebaseLedgerDataSyncDisabled"
    );
    if (isFirebaseLedgerDataSyncDisabled()) return fromUrl;

    const { isPlServerThinStaffClient } = await import("@/lib/plServerThinStaffClient");
    if (isPlServerThinStaffClient()) return fromUrl;

    const { isClientNavigatorOffline } = await import("@/lib/apkOnlineFirestoreWritePolicy");
    if (isClientNavigatorOffline()) return fromUrl;

    const { getLocalCompanyById } = await import("@/lib/localCompanyStore");
    const { isCloudBackedCompanyShape } = await import("@/lib/offlineFullWarmSync");
    const row = await getLocalCompanyById(cid, { includeDeleted: true });
    // Sirf Online/cloud companies: shared HTTPS Storage rewrite. Local/PL → as-is.
    if (!isCloudBackedCompanyShape(row as never)) return fromUrl;

    const {
      countAttachmentUsageInCompany,
      getAttachmentReuseSessionHintAsync,
      getFirebaseAttachmentRefCount,
      linkCloudAttachmentRefs,
    } = await import("@/lib/companyAttachmentRegistry");
    const [usage, sessionHint, registryCount] = await Promise.all([
      countAttachmentUsageInCompany(cid, fromUrl),
      getAttachmentReuseSessionHintAsync(cid, fromUrl),
      getFirebaseAttachmentRefCount(cid, fromUrl),
    ]);
    // Shared = SQLite places / paste session / Firestore registry.
    const isShared = usage >= 1 || sessionHint >= 2 || registryCount >= 2;
    if (!isShared) return fromUrl;

    const { resolveAttachmentImageMaxBytes } = await import("@/lib/attachmentCompressionUi");
    const maxBytes = await resolveAttachmentImageMaxBytes(cid);

    let compressed = params.compressed ?? null;
    if (!compressed) {
      const blob = await loadAttachmentBlob(fromUrl, { companyId: cid });
      if (!blob || blob.size <= maxBytes) return fromUrl;
      const kind = await sniffBlobKindForPreview(blob);
      if (kind !== "image") return fromUrl;
      const type = (blob.type || "image/jpeg").toLowerCase().startsWith("image/")
        ? blob.type || "image/jpeg"
        : "image/jpeg";
      const srcFile = new File([blob], fileNameForCompressedImage(fromUrl, type), { type });
      const next = await compressVoucherAttachment(srcFile, maxBytes);
      if (next.size >= blob.size) return fromUrl;
      compressed = next;
    }
    // Caller-provided File: over-cap path already made it smaller — upload + rewrite all places.

    if (!params.silent) {
      sonnerToast.message("Compressing shared file — updating all reuse places…");
    }

    const { uploadVoucherAttachmentFileToFirebase } = await import(
      "@/lib/voucherFormAttachmentSave"
    );
    const toUrl = await uploadVoucherAttachmentFileToFirebase({
      companyId: cid,
      voucherType: "attachments",
      file: compressed,
    });

    try {
      const { seedOfflineAttachmentCacheFromBlob } = await import(
        "@/lib/offlineAttachmentUrlCache"
      );
      await seedOfflineAttachmentCacheFromBlob(toUrl, compressed);
    } catch {
      /* non-fatal */
    }
    try {
      const { rememberHoverBlobUrl } = await import("@/lib/attachmentHoverBlobCache");
      const blobUrl = URL.createObjectURL(compressed);
      rememberHoverBlobUrl(toUrl, blobUrl);
      rememberHoverBlobUrl(`${toUrl}::cell-thumb`, blobUrl);
    } catch {
      /* non-fatal */
    }

    try {
      const { incrementCompanyStorage } = await import("@/lib/storageUsageClient");
      await incrementCompanyStorage(cid, {
        attachmentsBytes: compressed.size,
        storageBytes: compressed.size,
      });
    } catch {
      /* non-fatal */
    }

    const { rewriteCompanyHttpsAttachmentUrlEverywhere } = await import(
      "@/lib/rewriteCompanyHttpsAttachmentUrl"
    );
    const result = await rewriteCompanyHttpsAttachmentUrlEverywhere({
      companyId: cid,
      fromUrl,
      toUrl,
    });

    // Target form abhi SQLite me na ho — registry/session pe naya URL link.
    try {
      await linkCloudAttachmentRefs(cid, [toUrl]);
    } catch {
      /* non-fatal */
    }

    if (!params.silent) {
      if (result.deletedOld) {
        sonnerToast.success(
          `Shared file compressed (${result.rewrittenPlaces || Math.max(usage, sessionHint, registryCount)} places); old removed`
        );
      } else if (result.rewrittenPlaces > 0) {
        sonnerToast.success(`Shared file updated in ${result.rewrittenPlaces} places`);
      }
    }
    return toUrl;
  } catch (e) {
    console.error("[recompress] shared https compress failed — keep shared URL", e);
    // Fork mat: pehli URL hi rakh (badge / same ref).
    return fromUrl;
  }
}

/**
 * Over-cap HTTPS on Save:
 * - Reused (anywhere / session / registry) → compress + rewrite all + delete old (string URL).
 * - Never return File for reused HTTPS (File = per-voucher upload fork).
 * - Not reused → File so this voucher alone re-uploads.
 */
async function propagateReusedHttpsRecompressOrReturnFile(params: {
  companyId?: string | null;
  fromUrl: string;
  compressed: File;
  silent?: boolean;
}): Promise<File | string> {
  const cid = String(params.companyId || "").trim();
  const fromUrl = String(params.fromUrl || "").trim();
  if (!cid || !/^https?:\/\//i.test(fromUrl)) return params.compressed;

  const {
    countAttachmentUsageInCompany,
    getAttachmentReuseSessionHintAsync,
    getFirebaseAttachmentRefCount,
  } = await import("@/lib/companyAttachmentRegistry");
  const [usage, sessionHint, registryCount] = await Promise.all([
    countAttachmentUsageInCompany(cid, fromUrl),
    getAttachmentReuseSessionHintAsync(cid, fromUrl),
    getFirebaseAttachmentRefCount(cid, fromUrl),
  ]);
  const isShared = usage >= 1 || sessionHint >= 2 || registryCount >= 2;
  if (!isShared) return params.compressed;

  // Shared: always string URL. Fail/skip → original fromUrl (fork File nahi).
  return ensureSharedHttpsAttachmentCompressed({
    companyId: cid,
    fromUrl,
    compressed: params.compressed,
    silent: params.silent,
  });
}

/**
 * Images over company cap → compressed `File` (re-upload). Under-cap / non-image unchanged.
 * Online ≤100KB; Local / PL Server / Drive ≤150KB.
 * Reused HTTPS: upload + company-wide rewrite + delete old immediately.
 */
export async function recompressOversizedImageAttachmentsOnSave(
  items: (File | string)[],
  opts?: { companyId?: string | null; silent?: boolean }
): Promise<(File | string)[]> {
  if (!items.length) return items;
  const { resolveAttachmentImageMaxBytes } = await import("@/lib/attachmentCompressionUi");
  const maxBytes = await resolveAttachmentImageMaxBytes(opts?.companyId);

  const needsWork = items.some((item) => {
    if (item instanceof File) return isImageFile(item) && item.size > maxBytes;
    return typeof item === "string" && looksLikeImageAttachmentUrl(item);
  });
  if (!needsWork) return items;

  let toastId: string | number | undefined;
  if (!opts?.silent) {
    toastId = sonnerToast.loading("Compressing large images…");
  }

  try {
    const out: (File | string)[] = [];
    for (const item of items) {
      if (item instanceof File) {
        if (!isImageFile(item) || item.size <= maxBytes) {
          out.push(item);
          continue;
        }
        try {
          const compressed = await compressVoucherAttachment(item, maxBytes);
          out.push(compressed.size < item.size ? compressed : item);
        } catch (e) {
          console.error(e);
          out.push(item);
        }
        continue;
      }

      const url = String(item || "").trim();
      if (!url || !looksLikeImageAttachmentUrl(url)) {
        out.push(item);
        continue;
      }

      try {
        const blob = await loadAttachmentBlob(url, { companyId: opts?.companyId });
        if (!blob || blob.size <= maxBytes) {
          out.push(url);
          continue;
        }
        const kind = await sniffBlobKindForPreview(blob);
        if (kind !== "image") {
          out.push(url);
          continue;
        }
        const type = (blob.type || "image/jpeg").toLowerCase().startsWith("image/")
          ? blob.type || "image/jpeg"
          : "image/jpeg";
        const srcFile = new File([blob], fileNameForCompressedImage(url, type), { type });
        const compressed = await compressVoucherAttachment(srcFile, maxBytes);
        if (compressed.size < blob.size) {
          out.push(
            await propagateReusedHttpsRecompressOrReturnFile({
              companyId: opts?.companyId,
              fromUrl: url,
              compressed,
              silent: opts?.silent,
            })
          );
        } else {
          out.push(url);
        }
      } catch (e) {
        console.error(e);
        out.push(url);
      }
    }
    return out;
  } finally {
    if (toastId != null) sonnerToast.dismiss(toastId);
  }
}

/** PDF→JPEG (optional) then oversized-image recompress — voucher / master shared save entry. */
export async function prepareVoucherAttachmentsForSave(
  items: (File | string)[],
  opts?: {
    companyId?: string | null;
    savePdfAsImage?: boolean;
    lockPdfAsPdf?: boolean;
    lockedPdfFileUrls?: readonly string[];
  }
): Promise<(File | string)[]> {
  let pdfToastId: string | number | undefined;
  try {
    const { readLockPdfAsPdfPreference } = await import("@/lib/attachmentPdfOptions");
    const lockPdfAsPdf = opts?.lockPdfAsPdf ?? readLockPdfAsPdfPreference(false);
    const lockedPdfFileUrls = opts?.lockedPdfFileUrls;
    const savePdfAsImage = !!opts?.savePdfAsImage && !lockPdfAsPdf;

    let out = items;
    if (savePdfAsImage && shouldSuggestPdfAsImage(items)) {
      pdfToastId = sonnerToast.loading("Converting PDF attachments to image…");
      out = await convertPdfAttachmentsToJpegIfEnabled(out, true, {
        companyId: opts?.companyId,
        lockPdfAsPdf,
        lockedPdfFileUrls,
      });
      sonnerToast.dismiss(pdfToastId);
      pdfToastId = undefined;
    } else if (savePdfAsImage) {
      out = await convertPdfAttachmentsToJpegIfEnabled(out, true, {
        companyId: opts?.companyId,
        lockPdfAsPdf,
        lockedPdfFileUrls,
      });
    }
    return await recompressOversizedImageAttachmentsOnSave(out, { companyId: opts?.companyId });
  } finally {
    if (pdfToastId != null) sonnerToast.dismiss(pdfToastId);
  }
}

/** Master edit Save: PDF toggle (pref) + oversized image recompress for doc slots. */
export async function prepareMasterDocumentSlotsForSave(
  slots: (File | string)[],
  opts?: {
    companyId?: string | null;
    savePdfAsImage?: boolean;
    lockPdfAsPdf?: boolean;
    lockedPdfFileUrls?: readonly string[];
  }
): Promise<(File | string)[]> {
  const { readMasterSavePdfAsImagePreference, readLockPdfAsPdfPreference } = await import(
    "@/lib/attachmentPdfOptions"
  );
  return prepareVoucherAttachmentsForSave(slots, {
    companyId: opts?.companyId,
    savePdfAsImage: opts?.savePdfAsImage ?? readMasterSavePdfAsImagePreference(false),
    lockPdfAsPdf: opts?.lockPdfAsPdf ?? readLockPdfAsPdfPreference(false),
    lockedPdfFileUrls: opts?.lockedPdfFileUrls,
  });
}

/** Party/staff/bank/tax/expense edit — avatar + docs in one Prepare step. */
export async function prepareMasterEditAttachmentsForSave(params: {
  companyId?: string | null;
  avatar: File | string | null;
  documents: (File | string)[];
}): Promise<{
  avatar: File | string | null;
  newDocFiles: File[];
  keptDocUrls: string[];
}> {
  const docs = await prepareMasterDocumentSlotsForSave(params.documents, {
    companyId: params.companyId,
  });
  let avatar = params.avatar;
  if (avatar != null) {
    const [next] = await recompressOversizedImageAttachmentsOnSave([avatar], {
      companyId: params.companyId,
      silent: true,
    });
    avatar = next ?? null;
  }
  return {
    avatar,
    newDocFiles: docs.filter((x): x is File => x instanceof File),
    keptDocUrls: docs.filter((x): x is string => typeof x === "string"),
  };
}


