"use client";

import { shouldUseInAppPdfPreviewOverlay } from "@/lib/shouldUseInAppPdfPreview";
import { showInAppPdfPreview } from "@/lib/inAppPdfPreview";
import { showInAppImagePreview } from "@/lib/inAppImagePreview";

/** UI se pata ho to sniffing kam: pdf / image / unknown */
export type AttachmentKindHint = "pdf" | "image" | "other";

function pathLooksImage(pathLower: string): boolean {
  return /\.(jpe?g|png|gif|webp|bmp|svg)$/.test(pathLower);
}

function pathLooksPdf(pathLower: string): boolean {
  return pathLower.endsWith(".pdf");
}

/**
 * APK / static / mobile: file PDF ya image app ke andar overlay me; desktop wide = nayi tab.
 */
export async function openAttachmentInApp(
  url: string,
  opts?: { title?: string; kind?: AttachmentKindHint }
): Promise<void> {
  const u = String(url || "").trim();
  if (!u) return;

  if (!shouldUseInAppPdfPreviewOverlay()) {
    window.open(u, "_blank", "noopener,noreferrer");
    return;
  }

  const kind = opts?.kind ?? "other";
  const pathOnly = u.split("?")[0].split("#")[0].toLowerCase();
  const isDataImage = u.startsWith("data:image/");
  const isDataPdf = u.startsWith("data:application/pdf") || u.toLowerCase().startsWith("data:application%2fpdf");

  if (kind === "image" || isDataImage || pathLooksImage(pathOnly)) {
    showInAppImagePreview(u, () => {}, { title: opts?.title ?? "Image" });
    return;
  }

  if (kind === "pdf" || isDataPdf || pathLooksPdf(pathOnly)) {
    await openPdfFromUrl(u, opts?.title);
    return;
  }

  try {
    const res = await fetch(u, { mode: "cors", credentials: "omit" });
    const blob = await res.blob();
    const mime = (blob.type || res.headers.get("content-type") || "").toLowerCase();
    const bUrl = URL.createObjectURL(blob);
    const dispose = () => {
      try {
        URL.revokeObjectURL(bUrl);
      } catch {
        /* ignore */
      }
    };
    if (mime.startsWith("image/")) {
      showInAppImagePreview(bUrl, dispose, { title: opts?.title ?? "Image" });
      return;
    }
    if (mime === "application/pdf" || mime.includes("pdf")) {
      showInAppPdfPreview(bUrl, dispose, {
        title: opts?.title ?? "PDF",
        fileName: "document.pdf",
      });
      return;
    }
    dispose();
    window.open(u, "_blank", "noopener,noreferrer");
  } catch {
    window.open(u, "_blank", "noopener,noreferrer");
  }
}

async function openPdfFromUrl(u: string, title?: string): Promise<void> {
  try {
    const res = await fetch(u, { mode: "cors", credentials: "omit" });
    const blob = await res.blob();
    const bUrl = URL.createObjectURL(blob);
    showInAppPdfPreview(bUrl, () => URL.revokeObjectURL(bUrl), {
      title: title ?? "PDF",
      fileName: "document.pdf",
    });
  } catch {
    window.open(u, "_blank", "noopener,noreferrer");
  }
}
