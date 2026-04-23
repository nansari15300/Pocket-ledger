"use client";

/**
 * Voucher attach: optional PDF → stitched JPEG on save (new + edit me purane PDF URL).
 */
import { toast as sonnerToast } from "sonner";
import { compressFile } from "@/lib/compression";
import { attachmentMaxBytes } from "@/lib/attachmentCompressionUi";
import { sniffBlobKindForPreview } from "@/lib/attachmentFormatLabel";
import { convertPdfToStitchedJpegFile } from "@/lib/pdfToImageExport";
import { getBlobFromLocalFileRef, isLocalFileRef } from "@/lib/localPendingFiles";
import { isLocalOnlyMode } from "@/lib/localMode";

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
  enabled: boolean
): Promise<(File | string)[]> {
  if (!enabled) return items;
  const maxB = attachmentMaxBytes();
  const maxKB = Math.max(24, Math.floor(maxB / 1024));
  const minKB = Math.min(50, Math.floor(maxKB * 0.4));
  const out: (File | string)[] = [];

  for (const item of items) {
    if (item instanceof File) {
      if (!isPdfFile(item)) {
        out.push(item);
        continue;
      }
      try {
        let jpg = await convertPdfToStitchedJpegFile(item);
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

    // Static/local mode: linked string attachments (local refs / remote URLs) ko touch na karo.
    // Sirf newly-picked File PDFs convert hon, taaki edit/save flow me stale/CORS linked PDFs se error na aaye.
    if (isLocalOnlyMode()) {
      out.push(url);
      continue;
    }

    /* Offline `local:uuid` — URL me extension nahi; IndexedDB blob sniff se PDF tabhi convert */
    if (isLocalFileRef(url)) {
      try {
        const blob = await getBlobFromLocalFileRef(url);
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
        let jpg = await convertPdfToStitchedJpegFile(pdfFile);
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
      const res = await fetch(url, { mode: "cors" });
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const kind = await sniffBlobKindForPreview(blob);
      if (kind !== "pdf") {
        out.push(url);
        continue;
      }
      const pdfFile = new File([blob], "attachment.pdf", { type: "application/pdf" });
      let jpg = await convertPdfToStitchedJpegFile(pdfFile);
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
