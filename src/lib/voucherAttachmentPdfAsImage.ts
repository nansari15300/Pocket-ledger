"use client";

/**
 * Voucher attach: optional PDF → stitched JPEG on save (new + edit me purane PDF URL).
 * Static/APK: linked HTTPS PDF ab bhi convert — `fetch` skip tha (`isLocalOnlyMode`); hybrid blob se fix.
 */
import { toast as sonnerToast } from "sonner";
import { compressFile } from "@/lib/compression";
import { sniffBlobKindForPreview } from "@/lib/attachmentFormatLabel";
import { convertPdfToStitchedJpegFile } from "@/lib/pdfToImageExport";
import { getBlobFromLocalFileRef, isLocalFileRef } from "@/lib/localPendingFiles";
import { getRemoteAttachmentBlobPreferOfflineCache } from "@/lib/offlineAttachmentUrlCache";

export function looksLikePdfAttachmentUrl(url: string): boolean {
  const low = url.toLowerCase();
  if (low.includes("application/pdf") || low.includes("application%2fpdf")) return true;
  // Firebase `%2Ffile.pdf` / path ke beech `.pdf` — pehle sirf endsWith se miss ho jata tha
  if (low.includes(".pdf")) return true;
  const u = url.split("?")[0].toLowerCase();
  if (u.endsWith(".pdf")) return true;
  return false;
}

/** Edit mode: purane PDF URL ya naya PDF pick — checkbox auto on */
export function shouldSuggestPdfAsImage(items: (File | string)[]): boolean {
  return items.some(
    (x) =>
      (typeof x === "string" && looksLikePdfAttachmentUrl(x)) ||
      (x instanceof File &&
        ((x.type || "").toLowerCase().startsWith("application/pdf") ||
          x.name.toLowerCase().endsWith(".pdf")))
  );
}

function isPdfFile(f: File): boolean {
  const t = (f.type || "").toLowerCase();
  return t.startsWith("application/pdf") || f.name.toLowerCase().endsWith(".pdf");
}

/**
 * PDF `File` ya PDF download URL → `File` (JPEG). Baaki items same.
 * Fetch fail / convert fail par original chhod deta hai + toast.
 */
export async function convertPdfAttachmentsToJpegIfEnabled(
  items: (File | string)[],
  enabled: boolean,
  opts?: {
    companyId?: string | null;
    lockPdfAsPdf?: boolean;
    lockedPdfFileUrls?: readonly string[];
  }
): Promise<(File | string)[]> {
  if (!enabled) return items;
  const { shouldSkipPdfToJpegConversion } = await import("@/lib/attachmentPdfOptions");
  const { resolveAttachmentImageMaxBytes, IMAGE_SOFT_MIN_KB } = await import(
    "@/lib/attachmentCompressionUi"
  );
  const maxB = await resolveAttachmentImageMaxBytes(opts?.companyId);
  const maxKB = Math.max(24, Math.floor(maxB / 1024));
  const minKB = Math.min(IMAGE_SOFT_MIN_KB, Math.floor(maxKB * 0.5));
  const out: (File | string)[] = [];

  for (const item of items) {
    if (
      shouldSkipPdfToJpegConversion({
        lockPdfAsPdf: !!opts?.lockPdfAsPdf,
        lockedPdfFileUrls: opts?.lockedPdfFileUrls,
        item,
      })
    ) {
      out.push(item);
      continue;
    }

    if (item instanceof File) {
      if (!isPdfFile(item)) {
        out.push(item);
        continue;
      }
      try {
        let jpg = (await convertPdfToStitchedJpegFile(item)).file;
        jpg = await compressFile(jpg, {
          maxKB,
          minKB,
          maxPdfBytesAfter: maxB,
        });
        out.push(jpg);
      } catch (e) {
        console.error(e);
        sonnerToast.error("PDF to image failed", { description: item.name });
        out.push(item);
      }
      continue;
    }

    const url = item;

    /* Offline `local:uuid` — URL me extension nahi; IndexedDB blob sniff se PDF tabhi convert */
    if (isLocalFileRef(url)) {
      try {
        let blob = await getBlobFromLocalFileRef(url);
        if (!blob || blob.size === 0) {
          const { readActiveAttachmentCompanyId } = await import("@/lib/firestorePermissionSuppress");
          const cid = readActiveAttachmentCompanyId() ?? undefined;
          if (cid) {
            const { resolvePlServerStaffAttachmentPreviewBlob } = await import("@/lib/plServerAttachmentFetch");
            blob = await resolvePlServerStaffAttachmentPreviewBlob(url, { companyId: cid });
          }
        }
        if (!blob || blob.size === 0) {
          out.push(url);
          continue;
        }
        const kind = await sniffBlobKindForPreview(blob);
        if (kind !== "pdf") {
          out.push(url);
          continue;
        }
        const pdfFile = new File([blob], "attachment.pdf", { type: "application/pdf" });
        let jpg = (await convertPdfToStitchedJpegFile(pdfFile)).file;
        jpg = await compressFile(jpg, {
          maxKB,
          minKB,
          maxPdfBytesAfter: maxB,
        });
        out.push(jpg);
      } catch (e) {
        console.error(e);
        sonnerToast.error("PDF to image failed", { description: "Local attachment" });
        out.push(url);
      }
      continue;
    }

    if (!looksLikePdfAttachmentUrl(url)) {
      out.push(url);
      continue;
    }

    try {
      const trimmedUrl = url.trim();
      // APK / static WebView: seedha `fetch` + CORS often fail — Firebase SDK + warm IndexedDB (`FilePreview` jaisa).
      let blob: Blob | null =
        trimmedUrl.startsWith("http://") || trimmedUrl.startsWith("https://")
          ? await getRemoteAttachmentBlobPreferOfflineCache(trimmedUrl)
          : null;
      if (!blob || blob.size === 0) {
        const res = await fetch(url, { mode: "cors" });
        if (!res.ok) throw new Error(String(res.status));
        blob = await res.blob();
      }
      if (!blob || blob.size === 0) throw new Error("empty blob");
      const kind = await sniffBlobKindForPreview(blob);
      if (kind !== "pdf") {
        out.push(url);
        continue;
      }
      const pdfFile = new File([blob], "attachment.pdf", { type: "application/pdf" });
      let jpg = (await convertPdfToStitchedJpegFile(pdfFile)).file;
      jpg = await compressFile(jpg, {
        maxKB,
        minKB,
        maxPdfBytesAfter: maxB,
      });
      out.push(jpg);
    } catch (e) {
      console.error(e);
      sonnerToast.error("Could not convert linked PDF to image", {
        description: "Keeping original file. Check network or open in new tab.",
      });
      out.push(url);
    }
  }

  return out;
}
