"use client";

import { shouldUseInAppPdfPreviewOverlay } from "@/lib/shouldUseInAppPdfPreview";
import { showInAppPdfPreview } from "@/lib/inAppPdfPreview";
import { normalizeAttachmentUrlForDevicePreview } from "@/lib/attachmentHoldClipboard";
import {
  openHttpPdfInExternalBrowser,
  openLocalFileUriInExternalViewer,
  openPdfBlobInExternalViewer,
  shouldOpenPdfInExternalViewer,
} from "@/lib/openPdfExternal";
import { showInAppImagePreview } from "@/lib/inAppImagePreview";
import { openAttachmentGalleryInApp } from "@/lib/inAppAttachmentGallery";
import { tryGetBlobFromFirebaseStorageDownloadUrl } from "@/lib/storageGetBlobFromDownloadUrl";
import {
  looksLikeFirebaseStorageObjectPath,
  normalizeFirebaseStorageObjectPathForSdk,
} from "@/lib/firebaseStorageDownloadUrl";
import { isOfflineCacheableAttachmentRef } from "@/lib/attachmentRefBlobFetch";
import {
  getOfflineCachedAttachmentBlob,
  getOfflineCachedAttachmentNativeRef,
  getRemoteAttachmentBlobPreferOfflineCache,
  tryOfflineCachedAttachmentBlobMultiKey,
} from "@/lib/offlineAttachmentUrlCache";
import { isElectronDesktopApp } from "@/lib/isElectronDesktop";
import { isStaticAppBuild } from "@/lib/isStaticAppBuild";
import {
  isLocalFileRef,
  getBlobFromLocalFileRef,
  getLocalFileRefMeta,
  getLocalFileRefMetaSync,
} from "@/lib/localPendingFiles";
import { isDriveFileRef } from "@/lib/legacyDriveFileRef";
import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";
import { usesEmbeddedNativeAttachmentStorage } from "@/lib/usesEmbeddedNativeAttachmentStorage";
import { tryResolveRemoteUrlForStaleLocalAttachment } from "@/lib/resolveVoucherAttachmentRemoteUrl";
import { tryResolveInterCompanyPeerAttachmentUrl } from "@/lib/interCompany/interCompanyAttachmentPeerResolve";

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
  interCompanyPeer?: {
    peerCompanyId: string;
    peerVoucherId: string;
  };
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

/** Click-open cache path: HTTPS + Firebase path + `local:`/`drive:` (embedded preload cache). */
function isRemoteCacheableAttachmentSource(value: string): boolean {
  return isOfflineCacheableAttachmentRef(value);
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
 * File PDF ya image: overlay / gallery; HTTP URL par fetch + blob (CORS allow ho to) — web par bhi bahar tab kam.
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
  // PL_ATTACH_V1: clipboard marker aa gaya to underlying src (local:/https) decode karo —
  // warna isLocalFileRef check miss karta tha aur error dialog dikhta tha.
  const u = normalizeAttachmentUrlForDevicePreview(String(url || "").trim());
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

  // Drive cloud sync ref — offline preload cache pehle, phir pending/local match, phir Drive API.
  if (isDriveFileRef(u)) {
    const blob =
      (await getRemoteAttachmentBlobPreferOfflineCache(u, undefined, { galleryUrls: g?.urls })) ||
      (await getBlobFromLocalFileRef(u));
    if (!blob) {
      if (typeof window !== "undefined") {
        window.alert("Could not download this attachment from Google Drive. Check internet and Drive connection.");
      }
      return;
    }
    const bUrl = URL.createObjectURL(blob);
    try {
      const ct = blob.type.toLowerCase();
      const isPdf = opts?.kind === "pdf" || ct.includes("pdf");
      const isImg = opts?.kind === "image" || ct.startsWith("image/");
      if (isImg) {
        showInAppImagePreview(bUrl, () => URL.revokeObjectURL(bUrl), { title: opts?.title ?? "Image" });
        return;
      }
      if (isPdf && shouldUseInAppPdfPreviewOverlay()) {
        showInAppPdfPreview(bUrl, () => URL.revokeObjectURL(bUrl), { title: opts?.title ?? "PDF" });
        return;
      }
      if (isPdf) {
        await openPdfBlobInExternalViewer(blob, opts?.title ?? "PDF");
        URL.revokeObjectURL(bUrl);
        return;
      }
      window.open(bUrl, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(bUrl), 60_000);
    } catch (e) {
      URL.revokeObjectURL(bUrl);
      throw e;
    }
    return;
  }

  // Local-first: blob IndexedDB me — SQLite/Firestore me sirf `local:uuid` string
  if (isLocalFileRef(u)) {
    const kindHint = opts?.kind ?? "other";
    // Native/APK: local file URI direct open/preview — byte read bridge skip.
    if (usesEmbeddedNativeAttachmentStorage()) {
      const meta = getLocalFileRefMetaSync(u) ?? (await getLocalFileRefMeta(u));
      if (meta?.displayUrl) {
        const ct = String(meta.contentType || "").toLowerCase();
        const isPdf = kindHint === "pdf" || ct.includes("pdf");
        const isImg = kindHint === "image" || ct.startsWith("image/");
        if (isImg) {
          showInAppImagePreview(meta.displayUrl, () => {}, { title: opts?.title ?? "Image" });
          return;
        }
        if (isPdf) {
          if (shouldOpenPdfInExternalViewer() && meta.fileUri && isCapacitorNativeApp()) {
            await openLocalFileUriInExternalViewer(meta.fileUri, "application/pdf", opts?.title ?? "PDF");
            return;
          }
          if (shouldUseInAppPdfPreviewOverlay()) {
            await showInAppPdfPreview(meta.displayUrl, () => {}, {
              title: opts?.title ?? "PDF",
              fileName: "document.pdf",
            });
            return;
          }
        }
      }
      if (meta?.fileUri && isCapacitorNativeApp()) {
        const ct = String(meta.contentType || "").toLowerCase();
        const isPdf = kindHint === "pdf" || ct.includes("pdf");
        const isImg = kindHint === "image" || ct.startsWith("image/");
        if (isImg && meta.displayUrl) {
          showInAppImagePreview(meta.displayUrl, () => {}, { title: opts?.title ?? "Image" });
          return;
        }
        if (isPdf) {
          await openLocalFileUriInExternalViewer(meta.fileUri, "application/pdf", opts?.title ?? "PDF");
          return;
        }
        await openLocalFileUriInExternalViewer(
          meta.fileUri,
          meta.contentType || "application/octet-stream",
          opts?.title ?? "File"
        );
        return;
      }
    }
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
        if (sf.interCompanyPeer) {
          const peerUrl = await tryResolveInterCompanyPeerAttachmentUrl({
            staleUrl: u,
            clientFileUrls: sf.clientFileUrls,
            peerCompanyId: sf.interCompanyPeer.peerCompanyId,
            peerVoucherId: sf.interCompanyPeer.peerVoucherId,
          });
          if (peerUrl && peerUrl !== u) {
            await openAttachmentInApp(peerUrl, {
              title: opts?.title,
              kind: opts?.kind,
              gallery: opts?.gallery,
            });
            return;
          }
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

  const sfCompanyId = opts?.serverFallback?.companyId;
  const normalizedStoragePath = normalizeFirebaseStorageObjectPathForSdk(u, { companyId: sfCompanyId });
  if (looksLikeFirebaseStorageObjectPath(normalizedStoragePath, { companyId: sfCompanyId })) {
    const blob =
      (await tryOfflineCachedAttachmentBlobMultiKey(normalizedStoragePath)) ||
      (await getRemoteAttachmentBlobPreferOfflineCache(normalizedStoragePath, undefined, {
        galleryUrls: g?.urls,
      }));
    if (blob && blob.size > 0) {
      const bUrl = URL.createObjectURL(blob);
      const dispose = () => {
        try {
          URL.revokeObjectURL(bUrl);
        } catch {
          /* ignore */
        }
      };
      const mime = (blob.type || "").toLowerCase();
      const kindHint = opts?.kind ?? "other";
      if (kindHint === "image" || mime.startsWith("image/")) {
        showInAppImagePreview(bUrl, dispose, { title: opts?.title ?? "Image" });
        return;
      }
      if (kindHint === "pdf" || mime.includes("pdf")) {
        if (shouldUseInAppPdfPreviewOverlay()) {
          await showInAppPdfPreview(bUrl, dispose, { title: opts?.title ?? "PDF" });
          return;
        }
        dispose();
        await openPdfBlobInExternalViewer(blob, opts?.title ?? "PDF");
        return;
      }
      window.open(bUrl, "_blank", "noopener,noreferrer");
      setTimeout(dispose, 60_000);
      return;
    }
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
    // Capacitor/mobile: click-open ko instant rakho; warm cache fetch ko blocking mat banao.
    if (usesEmbeddedNativeAttachmentStorage()) {
      if (isRemoteCacheableAttachmentSource(u)) {
        try {
          // APK/EXE local-first: SQLite+disk cached display URL (HTTPS mat).
          const cachedRef = await getOfflineCachedAttachmentNativeRef(u);
          if (cachedRef?.displayUrl) {
            showInAppImagePreview(cachedRef.displayUrl, () => {}, {
              title: opts?.title ?? "Image",
            });
            return;
          }
        } catch {
          /* fall back to blob check */
        }
        try {
          // Native offline/restart reliability: cached blob mile to remote URL ke bajaay local object URL hi kholo.
          const cached = await tryOfflineCachedAttachmentBlobMultiKey(u);
          if (cached && cached.size > 0) {
            const bUrl = URL.createObjectURL(cached);
            showInAppImagePreview(bUrl, () => URL.revokeObjectURL(bUrl), {
              title: opts?.title ?? "Image",
            });
            return;
          }
        } catch {
          /* fall back to remote URL */
        }
        // APK online: turant HTTPS + background disk cache.
        if (isCapacitorNativeApp()) {
          void getRemoteAttachmentBlobPreferOfflineCache(u).catch(() => undefined);
          showInAppImagePreview(u, () => {}, { title: opts?.title ?? "Image" });
          return;
        }
      }
      // EXE: cache miss → network se blob + disk write, HTTPS overlay mat.
      try {
        const fresh = await getRemoteAttachmentBlobPreferOfflineCache(u);
        if (fresh && fresh.size > 0) {
          const bUrl = URL.createObjectURL(fresh);
          showInAppImagePreview(bUrl, () => URL.revokeObjectURL(bUrl), { title: opts?.title ?? "Image" });
          return;
        }
      } catch {
        /* fall through */
      }
      showInAppImagePreview(u, () => {}, { title: opts?.title ?? "Image" });
      return;
    }
    // Web browser: pehle local warm cache (IndexedDB), phir network.
    if (!isDataImage && isRemoteCacheableAttachmentSource(u)) {
      try {
        const cached =
          (await tryOfflineCachedAttachmentBlobMultiKey(u)) ||
          (await getRemoteAttachmentBlobPreferOfflineCache(u));
        if (cached && cached.size > 0) {
          const bUrl = URL.createObjectURL(cached);
          showInAppImagePreview(bUrl, () => URL.revokeObjectURL(bUrl), { title: opts?.title ?? "Image" });
          return;
        }
      } catch {
        /* fall through remote URL */
      }
    }
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
  const isHttp = /^https?:\/\//i.test(u);

  if (isHttp) {
    try {
      // Native/exe offline reliability: network se pehle local cache try karo.
      const cachedRef = await getOfflineCachedAttachmentNativeRef(u);
      if (cachedRef?.fileUri && shouldOpenPdfInExternalViewer()) {
        await openLocalFileUriInExternalViewer(
          cachedRef.fileUri,
          cachedRef.contentType || "application/pdf",
          fileName
        );
        return;
      }
      const cachedBlob = await tryOfflineCachedAttachmentBlobMultiKey(u);
      if (cachedBlob && cachedBlob.size > 0) {
        if (shouldOpenPdfInExternalViewer()) {
          await openPdfBlobInExternalViewer(cachedBlob, fileName);
          return;
        }
        const cachedUrl = URL.createObjectURL(cachedBlob);
        showInAppPdfPreview(cachedUrl, () => URL.revokeObjectURL(cachedUrl), {
          title: title ?? "PDF",
          fileName: "document.pdf",
        });
        return;
      }
    } catch {
      /* cache miss / read fail → network path */
    }
  }

  // HTTP(S) pe seedha browser / Custom Tab — fetch + blob duplicate load bachta hai
  if (shouldOpenPdfInExternalViewer() && isHttp) {
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
    let blob: Blob | null =
      (await tryOfflineCachedAttachmentBlobMultiKey(u)) ||
      (await tryGetBlobFromFirebaseStorageDownloadUrl(u));
    if (!blob) {
      blob = await getRemoteAttachmentBlobPreferOfflineCache(u);
    }
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
    // Background: next offline open ke liye bytes cache me likho.
    if (blob.size > 0 && (isStaticAppBuild() || isElectronDesktopApp())) {
      void getRemoteAttachmentBlobPreferOfflineCache(u).catch(() => undefined);
    }
  } catch {
    if (shouldUseInAppPdfPreviewOverlay()) {
      showInAppPdfOpenError(u);
      return;
    }
    window.open(u, "_blank", "noopener,noreferrer");
  }
}
