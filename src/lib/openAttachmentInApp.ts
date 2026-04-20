"use client";

import { shouldUseInAppPdfPreviewOverlay } from "@/lib/shouldUseInAppPdfPreview";
import { showInAppPdfPreview } from "@/lib/inAppPdfPreview";
import {
  openHttpPdfInExternalBrowser,
  openPdfBlobInExternalViewer,
  shouldOpenPdfInExternalViewer,
} from "@/lib/openPdfExternal";
import { showInAppImagePreview } from "@/lib/inAppImagePreview";
import { openAttachmentGalleryInApp } from "@/lib/inAppAttachmentGallery";
import { tryGetBlobFromFirebaseStorageDownloadUrl } from "@/lib/storageGetBlobFromDownloadUrl";
import { isLocalFileRef, getBlobFromLocalFileRef } from "@/lib/localPendingFiles";
import { tryResolveRemoteUrlForStaleLocalAttachment } from "@/lib/resolveVoucherAttachmentRemoteUrl";

/** UI se pata ho to sniffing kam: pdf / image / unknown */
export type AttachmentKindHint = "pdf" | "image" | "other";

/** Multi-file: same set me se ek open — gallery arrows / swipe */
export type OpenAttachmentGalleryOpts = {
  urls: readonly string[];
  startIndex: number;
  kinds?: readonly AttachmentKindHint[];
};

/** Jab device IndexedDB se `local:` blob gayab ho lekin voucher Firestore / mirror pe HTTPS URL ho */
export type OpenAttachmentServerFallback = {
  companyId: string;
  voucherId: string;
  clientFileUrls?: readonly string[] | null;
};

function pathLooksImage(pathLower: string): boolean {
  return /\.(jpe?g|png|gif|webp|bmp|svg)$/.test(pathLower);
}

function pathLooksPdf(pathLower: string): boolean {
  if (pathLower.endsWith(".pdf")) return true;
  /** Firebase `...%2Fname.pdf` — encoded slash ke saath bhi .pdf check */
  if (pathLower.includes(".pdf")) return true;
  try {
    const dec = decodeURIComponent(pathLower);
    return dec.endsWith(".pdf") || /\.pdf(\?|$)/i.test(dec);
  } catch {
    return false;
  }
}

function showInAppPdfOpenError(sourceUrl: string): void {
  // Native/static flow: show clear English error and optional external-app open fallback.
  if (typeof window !== "undefined") {
    const shouldOpenExternally = window.confirm(
      "PDF preview could not be loaded. Please check internet/CORS and try again.\n\nOpen in other app?"
    );
    if (shouldOpenExternally) {
      window.open(sourceUrl, "_blank", "noopener,noreferrer");
    }
  }
}

/**
 * APK / static / mobile: file PDF ya image app ke andar overlay me; desktop wide = nayi tab.
 */
export async function openAttachmentInApp(
  url: string,
  opts?: {
    title?: string;
    kind?: AttachmentKindHint;
    gallery?: OpenAttachmentGalleryOpts;
    serverFallback?: OpenAttachmentServerFallback;
  }
): Promise<void> {
  const u = String(url || "").trim();
  if (!u) return;

  const g = opts?.gallery;
  if (g) {
    const normalized = g.urls.map((x) => String(x).trim()).filter((s) => s.length > 0);
    if (normalized.length > 1) {
      const i = Math.max(0, Math.min(g.startIndex, normalized.length - 1));
      openAttachmentGalleryInApp(normalized, i, { title: opts?.title, kinds: g.kinds });
      return;
    }
  }

  // Local-first: blob IndexedDB me — SQLite/Firestore me sirf `local:uuid` string
  if (isLocalFileRef(u)) {
    const kindHint = opts?.kind ?? "other";
    const blob = await getBlobFromLocalFileRef(u);
    if (!blob) {
      const sf = opts?.serverFallback;
      if (sf?.companyId && sf?.voucherId) {
        const remote = await tryResolveRemoteUrlForStaleLocalAttachment(
          sf.companyId,
          sf.voucherId,
          u,
          sf.clientFileUrls
        );
        if (remote && !isLocalFileRef(remote)) {
          await openAttachmentInApp(remote, {
            title: opts?.title,
            kind: opts?.kind,
            gallery: opts?.gallery,
          });
          return;
        }
      }
      if (typeof window !== "undefined") {
        window.alert(
          "Attachment file not found on this device (cache may have been cleared). " +
            "Could not load a copy from the server — check internet or re-upload the file if the voucher still shows an old local link."
        );
      }
      return;
    }
    const bUrl = URL.createObjectURL(blob);
    const dispose = () => {
      try {
        URL.revokeObjectURL(bUrl);
      } catch {
        /* ignore */
      }
    };
    const mime = (blob.type || "").toLowerCase();
    if (kindHint === "image" || mime.startsWith("image/")) {
      showInAppImagePreview(bUrl, dispose, { title: opts?.title ?? "Image" });
      return;
    }
    if (kindHint === "pdf" || mime === "application/pdf" || mime.includes("pdf")) {
      // Mobile / APK: turant browser ya system PDF — WebView canvas preview blank reh sakta hai
      if (shouldOpenPdfInExternalViewer()) {
        dispose();
        await openPdfBlobInExternalViewer(blob, opts?.title ? `${opts.title}.pdf` : "document.pdf");
        return;
      }
      await showInAppPdfPreview(bUrl, dispose, {
        title: opts?.title ?? "PDF",
        fileName: "document.pdf",
      });
      return;
    }
    dispose();
    window.open(bUrl, "_blank", "noopener,noreferrer");
    return;
  }

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
    let blob: Blob | null = await tryGetBlobFromFirebaseStorageDownloadUrl(u);
    if (!blob) {
      const res = await fetch(u, { mode: "cors", credentials: "omit" });
      if (!res.ok) throw new Error(String(res.status));
      blob = await res.blob();
    }
    const mime = (blob.type || "").toLowerCase();
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
    // SDK blob ko empty `type` pani huna sakcha — extension sanga PDF māno
    if (mime === "application/pdf" || mime.includes("pdf") || pathLooksPdf(pathOnly)) {
      if (shouldOpenPdfInExternalViewer()) {
        dispose();
        await openPdfBlobInExternalViewer(blob, opts?.title ? `${opts.title}.pdf` : "document.pdf");
        return;
      }
      showInAppPdfPreview(bUrl, dispose, {
        title: opts?.title ?? "PDF",
        fileName: "document.pdf",
      });
      return;
    }
    dispose();
    window.open(u, "_blank", "noopener,noreferrer");
  } catch {
    if (shouldUseInAppPdfPreviewOverlay()) {
      showInAppPdfOpenError(u);
      return;
    }
    window.open(u, "_blank", "noopener,noreferrer");
  }
}

async function openPdfFromUrl(u: string, title?: string): Promise<void> {
  const fileName = title ? `${title.replace(/[/\\?%*:|"<>]/g, "_")}.pdf` : "document.pdf";

  // HTTP(S) pe seedha browser / Custom Tab — fetch + blob duplicate load bachta hai
  if (shouldOpenPdfInExternalViewer() && /^https?:\/\//i.test(u)) {
    await openHttpPdfInExternalBrowser(u);
    return;
  }
  if (shouldOpenPdfInExternalViewer() && u.startsWith("data:")) {
    try {
      const res = await fetch(u);
      const blob = await res.blob();
      await openPdfBlobInExternalViewer(blob, fileName);
      return;
    } catch {
      /* fall through to fetch path */
    }
  }

  try {
    let blob: Blob | null = await tryGetBlobFromFirebaseStorageDownloadUrl(u);
    if (!blob) {
      const res = await fetch(u, { mode: "cors", credentials: "omit" });
      if (!res.ok) throw new Error(String(res.status));
      blob = await res.blob();
    }
    if (shouldOpenPdfInExternalViewer()) {
      await openPdfBlobInExternalViewer(blob, fileName);
      return;
    }
    const bUrl = URL.createObjectURL(blob);
    showInAppPdfPreview(bUrl, () => URL.revokeObjectURL(bUrl), {
      title: title ?? "PDF",
      fileName: "document.pdf",
    });
  } catch {
    if (shouldUseInAppPdfPreviewOverlay()) {
      showInAppPdfOpenError(u);
      return;
    }
    window.open(u, "_blank", "noopener,noreferrer");
  }
}
