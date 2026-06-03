"use client";

import * as React from "react";
import { useCallback, useEffect, useState, useRef } from "react";
import Image from "next/image";
import { Copy, FileText, Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { openAttachmentInApp } from "@/lib/openAttachmentInApp";
import { AttachmentHoverPortal, useTapInteractionMode } from "@/components/vouchers/AttachmentHoverPortal";
import { storage } from "@/lib/firebase";
import { ref, getBlob } from "firebase/storage";
import {
  getAttachmentFormatLabel,
  getAttachmentFormatLabelFromHints,
  sniffBlobKindForPreview,
} from "@/lib/attachmentFormatLabel";
import {
  looksLikeFirebaseStorageObjectPath,
  tryGetStoragePathFromFirebaseDownloadUrl,
} from "@/lib/firebaseStorageDownloadUrl";
import {
  getOfflineCachedAttachmentBlob,
  getOfflineCachedAttachmentNativeRef,
  getRemoteAttachmentBlobPreferOfflineCache,
} from "@/lib/offlineAttachmentUrlCache";
import {
  getBlobFromLocalFileRef,
  getLocalFileRefMeta,
  getLocalFileRefMetaSync,
  getPendingPayloadForLocalRef,
  isLocalFileRef,
  LOCAL_FILE_PREFIX,
} from "@/lib/localPendingFiles";
import { isDriveFileRef } from "@/lib/localCloudSync/pocketLedgerDrivePaths";
import { useVoucherAttachmentFallback } from "@/contexts/VoucherAttachmentFallbackContext";
import { tryResolveRemoteUrlForStaleLocalAttachment } from "@/lib/resolveVoucherAttachmentRemoteUrl";
import { tryResolveInterCompanyPeerAttachmentUrl } from "@/lib/interCompany/interCompanyAttachmentPeerResolve";
import { isElectronDesktopApp } from "@/lib/isElectronDesktop";
import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";
import {
  useAttachmentHoldPointer,
  ATTACHMENT_HOLD_MS_MOBILE,
  ATTACHMENT_HOLD_MS_DESKTOP,
} from "@/hooks/useAttachmentHoldPointer";
import {
  buildHoldPayloadFromPreviewSource,
  writeAttachmentHoldClipboard,
  refreshAttachmentHoldSessionBackup,
} from "@/lib/attachmentHoldClipboard";
import { toast as sonnerToast } from "sonner";

/** Forensic: `NEXT_PUBLIC_ATTACHMENT_FORENSIC_DEBUG=1` — FilePreview branch + ATTACHMENT_PREVIEW_DOWNGRADE proof. */
const FILE_PREVIEW_FORENSIC =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_ATTACHMENT_FORENSIC_DEBUG === "1";

/** `next/image` + `blob:` / `data:` — internal fetch / paint race se `ERR_FILE_NOT_FOUND`; native `<img>` safe. */
function isBlobOrDataDisplayUrl(u: string | null | undefined): boolean {
  if (!u || typeof u !== "string") return false;
  return u.startsWith("blob:") || u.startsWith("data:");
}

function logFilePreviewForensic(tag: string, payload: Record<string, unknown>) {
  if (!FILE_PREVIEW_FORENSIC) return;
  console.warn("[FORENSIC_FILE_PREVIEW]", { tag, ...payload });
}

/** Sirf tab jab `resolvedType==="other"` aur URL null — generic FILE icon fail point. */
function logAttachmentPreviewDowngradeToGenericFile(
  reasonTag: string,
  fileValue: File | string,
  resolvedUrl: string | null,
  resolvedType: string,
  extra?: Record<string, unknown>
) {
  if (!FILE_PREVIEW_FORENSIC) return;
  if (resolvedType === "other" && (resolvedUrl == null || resolvedUrl === "")) {
    console.warn("ATTACHMENT_PREVIEW_DOWNGRADE_TO_GENERIC_FILE", {
      reasonTag,
      originalFile: typeof fileValue === "string" ? fileValue : fileValue?.name,
      resolvedUrl,
      resolvedType,
      ...extra,
    });
  }
}

/** JPG seedha browser decode; PDF = download + pdf.js + canvas — 3–6s pehli baar normal. Dubara same URL tez ho: LRU cache. */
const PDF_THUMB_LRU_MAX = 40;
const pdfThumbLru = new Map<string, string>();
/** Same PDF key ke parallel renders ko dedupe karo — rerender storm me duplicate pdf.js work avoid. */
const pdfThumbInFlight = new Map<string, Promise<string | null>>();

function pdfThumbCacheKey(
  fileObject: File | undefined,
  pdfUrl: string,
  firebaseStoragePath: string | undefined,
  edge: number
): string {
  if (fileObject instanceof File) {
    return `f:${fileObject.name}:${fileObject.size}:${fileObject.lastModified}:${edge}`;
  }
  return `u:${pdfUrl}|${firebaseStoragePath ?? ""}|${edge}`;
}

function pdfThumbBlobIsCached(blobUrl: string | null): boolean {
  if (!blobUrl) return false;
  for (const v of pdfThumbLru.values()) if (v === blobUrl) return true;
  return false;
}

function pdfThumbCacheGet(key: string): string | undefined {
  const v = pdfThumbLru.get(key);
  if (v === undefined) return undefined;
  pdfThumbLru.delete(key);
  pdfThumbLru.set(key, v);
  return v;
}

/** Jagah kam ho to purani entry hatao; blob revoke nahi — warna dusra tile jiska img abhi wahi URL ho to tut jaye */
function pdfThumbCacheSet(key: string, blobUrl: string) {
  pdfThumbLru.delete(key);
  pdfThumbLru.set(key, blobUrl);
  while (pdfThumbLru.size > PDF_THUMB_LRU_MAX) {
    const oldest = pdfThumbLru.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    pdfThumbLru.delete(oldest);
  }
}

/** Tooltip/hover FilePreview jiska previewBox 600×700 hai — wahi layoutMaxEdge=700 cache key */
const GALLERY_PDF_HOVER_THUMB_EDGE = 700;
// `NEXT_PUBLIC_STATIC_BUILD` / Capacitor pe pehle 5s tha — Firebase PDF + IndexedDB warm slow → fetch abort, lal icon, phir dubara try se 30–60s feel. `next dev` jaisa 25s taaki gallery/hover web jaisa.
const PDF_REMOTE_FETCH_TIMEOUT_MS = 25_000;

/**
 * Gallery "Full preview" ON par current page ke PDF hovers ke liye pdf.js + pehla page pehle se cache me;
 * mouse le jate hi tooltip me turant thumb dikhe.
 */
export async function prewarmPdfThumbnailsForGallery(
  entries: ReadonlyArray<{ url: string; storagePath?: string }>,
  signal?: AbortSignal
): Promise<void> {
  const seen = new Set<string>();
  const { convertPdfFirstPageToImage } = await import("@/lib/pdfToImage");
  for (const { url, storagePath } of entries) {
    if (signal?.aborted) return;
    const u = String(url).trim();
    if (!u) continue;
    // Local gallery = `data:application/pdf`; Firebase URL kabhi filename me literal `.pdf` na ho — label se sniff
    const base = u.split("?")[0].toLowerCase();
    let isPdfEntry =
      u.startsWith("data:application/pdf") ||
      getAttachmentFormatLabel(u) === "PDF" ||
      base.endsWith(".pdf");
    // Voucher attachment `local:uuid` — Native par blob sniff nahi; metadata se PDF detect.
    if (!isPdfEntry && u.startsWith(LOCAL_FILE_PREFIX)) {
      try {
        if (isCapacitorNativeApp()) {
          const meta = await getLocalFileRefMeta(u);
          isPdfEntry = String(meta?.contentType || "").toLowerCase().includes("pdf");
        } else {
          const lb = await getBlobFromLocalFileRef(u);
          if (lb && (await sniffBlobKindForPreview(lb)) === "pdf") isPdfEntry = true;
        }
      } catch {
        /* skip */
      }
    }
    if (!isPdfEntry) continue;
    const ck = pdfThumbCacheKey(undefined, u, storagePath, GALLERY_PDF_HOVER_THUMB_EDGE);
    if (seen.has(ck)) continue;
    seen.add(ck);
    if (pdfThumbCacheGet(ck)) continue;
    try {
      let pdfFile: Blob;
      if (storagePath) {
        const storageRef = ref(storage, storagePath);
        pdfFile = await getBlob(storageRef);
      } else if (u.startsWith(LOCAL_FILE_PREFIX)) {
        if (isCapacitorNativeApp()) continue;
        const lb = await getBlobFromLocalFileRef(u);
        if (!lb || lb.size === 0) continue;
        pdfFile = lb;
      } else if (u.startsWith("data:")) {
        const res = await fetch(u, { signal });
        if (!res.ok) continue;
        pdfFile = await res.blob();
      } else if (u.startsWith("http") || u.startsWith("blob:")) {
        // Full warm sync ne IndexedDB me jo PDF cache kiya ho — gallery hover turant
        let pdfFileHttp: Blob | null = null;
        if (u.startsWith("http")) {
          pdfFileHttp = await getRemoteAttachmentBlobPreferOfflineCache(u, signal);
        }
        if (!pdfFileHttp || pdfFileHttp.size === 0) {
          const res = await fetch(u, { mode: "cors", signal });
          if (!res.ok) continue;
          pdfFileHttp = await res.blob();
        }
        pdfFile = pdfFileHttp;
      } else {
        continue;
      }
      if (signal?.aborted) return;
      const result = await convertPdfFirstPageToImage(pdfFile, 0.85, 800, { signal });
      if (signal?.aborted) {
        URL.revokeObjectURL(result.thumbnailUrl);
        return;
      }
      pdfThumbCacheSet(ck, result.thumbnailUrl);
    } catch {
      /* ek PDF fail ho to baaki warm rahein */
    }
  }
}

async function fetchBlobWithTimeout(
  input: string,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<Blob> {
  // Online warm sync cache — offline pe bina network PDF thumb
  if (input.startsWith("http://") || input.startsWith("https://")) {
    const warm = await getOfflineCachedAttachmentBlob(input);
    if (warm && warm.size > 0) return warm;
  }
  // APK/static: hung network calls should fail fast so thumbnail UI doesn't spin forever.
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(input, { mode: "cors", signal: controller.signal });
    if (!res.ok) throw new Error(`PDF fetch ${res.status}`);
    return await res.blob();
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", onAbort);
  }
}

const formatBytes = (bytes: number, decimals = 2) => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
};

interface FilePreviewProps {
  file: File | string;
  onRemove?: () => void;
  isAvatar?: boolean;
  isCompressing?: boolean;
  compressionResult?: { originalSize: number; compressedSize: number } | null;
  children?: React.ReactNode;
  size?: number;
  fileSize?: number; // Accept size from parent
  /** Square ke alawa fixed box (sirf gallery hover jaise); set ho to width/height yahi, PDF raster = max(edge) */
  previewBox?: { width: number; height: number };
  className?: string;
  disabled?: boolean; // Block add/remove; preview optional via allowPreviewWhenDisabled
  /** Edit locked par bhi thumbnail click se open allow (IC view-only) */
  allowPreviewWhenDisabled?: boolean;
  /** Firebase Storage path (e.g. companies/xxx/unassigned/yyy.pdf). When set, PDF thumbnail is loaded via SDK to avoid CORS/fetch failures. */
  storagePath?: string;
  /** object-contain = full image visible at best quality; object-cover = crop to fill (default). */
  objectFit?: "cover" | "contain";
  /**
   * Hover par bada side-panel (zoom) — default off: thumbnail click = open file; chaho to `true` se purana hover zoom wapas.
   */
  enableHoverFullPreview?: boolean;
  /** Thumbnail ke corner par chhota PDF/JPEG text; forms + gallery ke liye default on. */
  showFormatBadge?: boolean;
  /** Saved URLs only (same voucher/entity set) — click par multi-file viewer ← → / swipe */
  attachmentGallery?: { urls: string[]; startIndex: number };
  /** Voucher edit: `files` se string URLs — server pe HTTPS milne par index match */
  attachmentClientFileUrls?: string[];
  /** ~2s hold = clipboard me attachment ref (paste = nayi copy upload). Gallery / nested hover par false. */
  holdAttachmentClipboard?: boolean;
}

const getCleanName = (name: string) => {
  if (name.includes('_')) {
    return name.split('_').slice(1).join('_');
  }
  return name;
};

// Bade hover-preview ka max width — transaction table file column se align
const HOVER_PREVIEW_MAX_PX = 800;

export function FilePreview({
  file,
  onRemove,
  isAvatar = false,
  isCompressing: isCompressingProp,
  compressionResult,
  children,
  size = 96,
  fileSize,
  previewBox,
  className,
  disabled = false,
  allowPreviewWhenDisabled = false,
  storagePath,
  objectFit = "cover",
  enableHoverFullPreview = false,
  showFormatBadge = true,
  attachmentGallery,
  attachmentClientFileUrls,
  holdAttachmentClipboard = true,
}: FilePreviewProps) {
  const voucherAttachmentFb = useVoucherAttachmentFallback();
  // URL-only props (e.g. gallery vouchers) par Firebase SDK se blob — fetch/CORS fail hone par bhi thumb mile
  const resolvedStoragePath = React.useMemo(() => {
    if (storagePath) return storagePath;
    if (typeof file === "string") return tryGetStoragePathFromFirebaseDownloadUrl(file) ?? undefined;
    return undefined;
  }, [file, storagePath]);

  /** Voucher attach grid: parent `h-16`/`h-24` + `w-full` — inline 96px style mat lagao (Add box chhota na dikhe) */
  const fillsParentAttachSlot = Boolean(
    className && /\bw-full\b/.test(className) && /\bh-(?:16|24)\b/.test(className)
  );
  const layoutW = fillsParentAttachSlot ? size : previewBox?.width ?? size;
  const layoutH = fillsParentAttachSlot ? size : previewBox?.height ?? size;
  const layoutMaxEdge = Math.max(layoutW, layoutH);

  // Sirf content fingerprints — naya array/object ref (parent tick / interval) par preview `useEffect` na chale, blob revoke flash na ho.
  const attachmentClientUrlsFingerprint =
    !Array.isArray(attachmentClientFileUrls) || attachmentClientFileUrls.length === 0
      ? ""
      : attachmentClientFileUrls.join("\u0001");
  const attachmentGalleryFingerprint =
    !attachmentGallery?.urls?.length
      ? ""
      : `${attachmentGallery.startIndex}\u0001${attachmentGallery.urls.join("\u0001")}`;
  const voucherAttachmentFbFingerprint = voucherAttachmentFb
    ? `${voucherAttachmentFb.companyId}\u0001${voucherAttachmentFb.voucherId}`
    : "";

  /** Native/local file ke liye render-time sync fast-path (no Promise wait before `<img src>`). */
  const immediateLocalInfo = React.useMemo(() => {
    if (!(typeof file === "string" && isLocalFileRef(file) && isCapacitorNativeApp())) return null;
    const meta = getLocalFileRefMetaSync(file);
    if (!meta?.displayUrl) return null;
    let type: "image" | "pdf" | "other" = "other";
    const ct = String(meta.contentType || "").toLowerCase();
    if (ct.includes("pdf")) type = "pdf";
    else if (ct.startsWith("image/")) type = "image";
    let name = "file";
    if (meta.fileName) {
      try {
        name = decodeURIComponent(String(meta.fileName));
      } catch {
        name = String(meta.fileName);
      }
    }
    const hinted = getAttachmentFormatLabelFromHints(meta.fileName, meta.contentType) || "";
    const formatLabel = type === "pdf" ? "PDF" : type === "image" ? hinted || "IMAGE" : hinted || "FILE";
    return {
      url: meta.displayUrl,
      type,
      name,
      size: Number(meta.size || fileSize || 0) || null,
      formatLabel,
    } as const;
  }, [file, fileSize]);

  const [fileInfo, setFileInfo] = useState<{
    url: string | null;
    type: "image" | "pdf" | "other";
    name: string;
    size: number | null;
    formatLabel: string;
  }>(
    immediateLocalInfo
      ? {
          url: immediateLocalInfo.url,
          type: immediateLocalInfo.type,
          name: immediateLocalInfo.name,
          size: immediateLocalInfo.size,
          formatLabel: immediateLocalInfo.formatLabel,
        }
      : { url: null, type: "other", name: "loading...", size: null, formatLabel: "" }
  );

  const [isLoading, setIsLoading] = useState(immediateLocalInfo ? false : true);
  const [pdfThumbnail, setPdfThumbnail] = useState<string | null>(null);
  const [isPdfLoading, setIsPdfLoading] = useState(false);
  /** Render-time source of truth: sync local info available ho to spinner wait skip. */
  const viewFileInfo = immediateLocalInfo ?? fileInfo;
  const viewIsLoading = immediateLocalInfo ? false : isLoading;

  const thumbnailUrlRef = useRef<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Revoke object URL to avoid memory leaks (thumbnails are blob URLs)
  const revokeThumbnailUrl = useCallback((url: string | null) => {
    if (url && url.startsWith("blob:")) {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // ignore
      }
    }
  }, []);

  const setPdfThumbnailSafe = useCallback((url: string | null) => {
    if (thumbnailUrlRef.current !== url) {
      const prev = thumbnailUrlRef.current;
      // Shared cache blob revoke mat karo — warna dusra FilePreview + tutega
      if (prev && !pdfThumbBlobIsCached(prev)) revokeThumbnailUrl(prev);
      thumbnailUrlRef.current = url;
      setPdfThumbnail(url);
    }
  }, [revokeThumbnailUrl]);

  // pdf.js pehli baar 10–40s bhi le sakta hai; 5s = hover/popup me preview hamesha fail (reference-app jaisa lamba race)
  const PDF_THUMBNAIL_FETCH_RACE_MS = 45_000;
  /** Sirf stuck/hang: normal case me unmount se abort hota hai */
  const PDF_THUMBNAIL_EFFECT_HARD_ABORT_MS = 120_000;

  // Generate PDF thumbnail (first page as image). Supports multiple PDFs; loading state and fallback icon handled.
  const generatePdfThumbnail = useCallback(
    async (
      pdfUrl: string,
      fileObject?: File,
      firebaseStoragePath?: string,
      signal?: AbortSignal
    ) => {
      const timeoutPromise = new Promise<never>((_, reject) => {
        const t = setTimeout(
          () => reject(new DOMException("PDF preview timed out", "AbortError")),
          PDF_THUMBNAIL_FETCH_RACE_MS
        );
        signal?.addEventListener("abort", () => clearTimeout(t), { once: true });
      });

      const ck = pdfThumbCacheKey(
        fileObject instanceof File ? fileObject : undefined,
        pdfUrl,
        firebaseStoragePath,
        layoutMaxEdge
      );

      const run = async (): Promise<string | null> => {
        const cachedBlobUrl = pdfThumbCacheGet(ck);
        if (cachedBlobUrl) {
          setPdfThumbnailSafe(cachedBlobUrl);
          return cachedBlobUrl;
        }
        // Native/local path: persisted jpg thumb ho to PDF bytes read ki zaroorat nahi.
        if (isCapacitorNativeApp()) {
          const { getNativePdfThumbnailDisplayUrl } = await import("@/lib/pdfToImage");
          const nativeThumb = await getNativePdfThumbnailDisplayUrl(ck);
          if (nativeThumb) {
            pdfThumbCacheSet(ck, nativeThumb);
            setPdfThumbnailSafe(nativeThumb);
            return nativeThumb;
          }
        }
        // Existing in-flight promise reuse — same key par dobara heavy render/fetch mat chalao.
        const existingInflight = pdfThumbInFlight.get(ck);
        if (existingInflight) {
          const reused = await existingInflight;
          if (reused) setPdfThumbnailSafe(reused);
          return reused;
        }

        setIsPdfLoading(true);
        const job = (async (): Promise<string | null> => {
          let pdfFile: File | ArrayBuffer | Blob;

          if (fileObject instanceof File) {
            pdfFile = fileObject;
          } else if (firebaseStoragePath && storage) {
          // Pehle signed URL → SDK+fetch helper (CORS + naya `*.firebasestorage.app` host); phir direct getBlob — sirf getBlob+5s pe web "online" preview fail hota tha.
            let resolved: Blob | null = null;
            if (pdfUrl.startsWith("http")) {
            // Pehle warm-sync IndexedDB; phir SDK/getBlob path (helper se bytes background cache)
              resolved = await getRemoteAttachmentBlobPreferOfflineCache(pdfUrl, signal);
            }
            if (!resolved) {
              try {
                const storageRef = ref(storage, firebaseStoragePath);
                resolved = await Promise.race([
                  getBlob(storageRef),
                  new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error("Storage getBlob timeout")), PDF_REMOTE_FETCH_TIMEOUT_MS)
                  ),
                ]);
              } catch {
                resolved = null;
              }
            }
            // Signed download URL ab bhi kaam kar sakta hai jab getBlob/rules fail — bina iske hover me sirf lal PDF icon
            if (!resolved && pdfUrl.startsWith("http")) {
              try {
                resolved = await fetchBlobWithTimeout(pdfUrl, PDF_REMOTE_FETCH_TIMEOUT_MS, signal);
              } catch {
                resolved = null;
              }
            }
            if (!resolved) {
              setIsPdfLoading(false);
              return null;
            }
            pdfFile = resolved;
          } else if (pdfUrl.startsWith("blob:")) {
            const response = await fetch(pdfUrl, { signal });
            pdfFile = await response.blob();
          } else if (pdfUrl.startsWith(LOCAL_FILE_PREFIX)) {
            // Native/local: display path direct hai; thumb cache miss par sync-time generation na ho to icon fallback (bridge read avoid).
            if (isCapacitorNativeApp()) {
              setIsPdfLoading(false);
              return null;
            }
            // Web/electron fallback: local ref bytes read करके thumb बना सकते हैं.
            const blob = await getBlobFromLocalFileRef(pdfUrl);
            if (!blob || blob.size === 0) {
              setIsPdfLoading(false);
              return null;
            }
            pdfFile = blob;
          } else if (pdfUrl.startsWith("data:")) {
            // Local unassigned gallery: PDF `localStorage` me data URL — pehle yahan branch na thi to sirf lal PDF icon
            const response = await fetch(pdfUrl, { signal });
            pdfFile = await response.blob();
          } else if (pdfUrl.startsWith("http")) {
            // Warm cache → SDK/fetch (timeout wala fallback jab helper null)
            const hydrated = await getRemoteAttachmentBlobPreferOfflineCache(pdfUrl, signal);
            pdfFile =
              hydrated && hydrated.size > 0
                ? hydrated
                : await fetchBlobWithTimeout(pdfUrl, PDF_REMOTE_FETCH_TIMEOUT_MS, signal);
          } else {
            setIsPdfLoading(false);
            return null;
          }

          if (signal?.aborted) return null;

          const { convertPdfFirstPageToImage } = await import("@/lib/pdfToImage");
          const result = await convertPdfFirstPageToImage(
            pdfFile,
            0.85,
            layoutMaxEdge > 150 ? 800 : 600,
            { signal }
          );

          if (signal?.aborted) {
            revokeThumbnailUrl(result.thumbnailUrl);
            return null;
          }
          let finalThumbUrl = result.thumbnailUrl;
          // Native/APK: generated thumb ko DataDirectory me persist karo, agle render me direct path load ho.
          if (isCapacitorNativeApp()) {
            const { saveNativePdfThumbnail } = await import("@/lib/pdfToImage");
            const persistedUrl = await saveNativePdfThumbnail(ck, result.thumbnailBlob);
            if (persistedUrl) {
              try {
                URL.revokeObjectURL(result.thumbnailUrl);
              } catch {
                /* ignore */
              }
              finalThumbUrl = persistedUrl;
            }
          }
          pdfThumbCacheSet(ck, finalThumbUrl);
          setPdfThumbnailSafe(finalThumbUrl);
          return finalThumbUrl;
        })();
        pdfThumbInFlight.set(ck, job);
        try {
          return await job;
        } finally {
          pdfThumbInFlight.delete(ck);
        }
      };

      try {
        await Promise.race([run(), timeoutPromise]);
      } catch (error) {
        if ((error as Error)?.name === "AbortError") return;
        setPdfThumbnailSafe(null);
      } finally {
        setIsPdfLoading(false);
      }
    },
    [layoutMaxEdge, revokeThumbnailUrl, setPdfThumbnailSafe]
  );

  useEffect(() => {
    let objectUrl: string | null = null;
    let pdfThumbDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    const controller = new AbortController();
    let fileObject: File | null = null;

    const processFile = async () => {
      setIsLoading(true);
      let resolvedUrl: string | null = null;
      let resolvedType: "image" | "pdf" | "other" = "other";
      let resolvedName = "file";
      let resolvedSize: number | null = fileSize ?? null;
      let localFormatHint: string | null = null;

      if (typeof file === "string") {
        if (/^https?:\/\//i.test(file) && !file.startsWith(LOCAL_FILE_PREFIX)) {
          let nativeCachedRef: { displayUrl: string; contentType: string | null } | null = null;
          if (isCapacitorNativeApp()) {
            try {
              // Native local-first: cache row ho to direct file URI display URL use karo (offline/restart stable preview).
              nativeCachedRef = await getOfflineCachedAttachmentNativeRef(file);
            } catch {
              nativeCachedRef = null;
            }
          }
          // Policy: display kabhi raw signed HTTPS `<Image>` par mat — hamesha IndexedDB/native blob (online/offline same pipeline).
          const warmEarly = await getOfflineCachedAttachmentBlob(file);
          let probe: Blob | null = warmEarly && warmEarly.size > 0 ? warmEarly : null;
          // APK: `navigator.onLine` false hone par bhi Storage SDK chal sakta hai — pehla paint yahi block ho raha tha.
          const navOn =
            typeof navigator !== "undefined" &&
            (navigator.onLine || isCapacitorNativeApp());
          if (!probe && navOn) {
            probe = await getRemoteAttachmentBlobPreferOfflineCache(file, controller.signal);
          }
          if (probe && probe.size > 0) {
            objectUrl = URL.createObjectURL(probe);
            resolvedUrl = objectUrl;
          } else if (nativeCachedRef?.displayUrl) {
            resolvedUrl = nativeCachedRef.displayUrl;
          } else {
            resolvedUrl = null;
          }
          try {
            resolvedName = decodeURIComponent(file.split("/").pop()?.split("?")[0] || "file");
          } catch {
            resolvedName = file.split("/").pop()?.split("?")[0] || "file";
          }
          const nativeCt = String(nativeCachedRef?.contentType || "").toLowerCase();
          const lbl = getAttachmentFormatLabel(file);
          const cleanUrl = file.split("?")[0].toLowerCase();
          if (nativeCt.includes("pdf")) {
            resolvedType = "pdf";
          } else if (nativeCt.startsWith("image/")) {
            resolvedType = "image";
          } else if (lbl === "PDF" || cleanUrl.endsWith(".pdf") || cleanUrl.includes(".pdf")) {
            resolvedType = "pdf";
          } else if (
            ["JPG", "JPEG", "PNG", "GIF", "WEBP", "BMP", "SVG", "HEIC", "HEIF"].includes(lbl) ||
            cleanUrl.match(/\.(jpeg|jpg|gif|png|webp|bmp|svg)(\?|$)/)
          ) {
            resolvedType = "image";
          } else {
            resolvedType = "image";
          }
          let formatLabel = getAttachmentFormatLabel(file);
          if (resolvedType === "pdf") formatLabel = "PDF";
          else if (resolvedType === "image" && (formatLabel === "FILE" || formatLabel === "OTHER"))
            formatLabel = "IMAGE";

          // Blob/native miss + label image: `<Image src="">` broken — generic file icon
          if (!resolvedUrl && resolvedType === "image") {
            resolvedType = "other";
            logAttachmentPreviewDowngradeToGenericFile(
              "https_branch_labeled_image_but_no_blob_or_native_displayUrl",
              file,
              resolvedUrl,
              resolvedType,
              {
                warmEarlyBytes: warmEarly?.size ?? 0,
                probeAfterHydrateBytes: probe?.size ?? 0,
                navOn,
              }
            );
          }

          logFilePreviewForensic("https_url_branch_first_paint", {
            originalFile: file,
            resolvedUrl,
            resolvedType,
            offlineCacheWarmEarlyBytes: warmEarly?.size ?? 0,
            probeBytes: probe?.size ?? 0,
            hadNativeCachedRef: Boolean(nativeCachedRef?.displayUrl),
            navOn,
          });

          setFileInfo({
            url: resolvedUrl,
            type: resolvedType,
            name: resolvedName,
            size: resolvedSize,
            formatLabel,
          });
          setIsLoading(false);

          // Sniff/cache later: first paint fast rakho, phir background me disk cache hydrate karke offline-safe blob URL par swap karo.
          void (async () => {
            try {
              // 1) Offline/restart fast fallback: pehle local cache read try.
              let probe = await getOfflineCachedAttachmentBlob(file);
              // 2) Cache miss + online: network se hydrate karo (is call me putCachedBlob bhi hota hai); offline par fetch mat — hang/spinner.
              if (
                (!probe || probe.size === 0) &&
                !controller.signal.aborted &&
                typeof navigator !== "undefined" &&
                (navigator.onLine || isCapacitorNativeApp())
              ) {
                // Persist run ko component lifecycle se mat baandho; tile unmount ho tab bhi cache fill complete ho.
                probe = await getRemoteAttachmentBlobPreferOfflineCache(file);
              }
              if (!probe || probe.size === 0 || controller.signal.aborted) return;
              const kind = await sniffBlobKindForPreview(probe);
              if (controller.signal.aborted) return;
              if (kind === "pdf") {
                setFileInfo((prev) => ({
                  ...prev,
                  type: "pdf",
                  formatLabel: "PDF",
                }));
                setPdfThumbnailSafe(null);
                const PDF_THUMB_DEBOUNCE_MS = 120;
                pdfThumbDebounceTimer = setTimeout(() => {
                  if (!controller.signal.aborted) {
                    generatePdfThumbnail(file, undefined, resolvedStoragePath, controller.signal);
                  }
                }, PDF_THUMB_DEBOUNCE_MS);
              } else if (kind === "image") {
                // Remote URL pe hi atke rehne se offline restart par image टूट सकती है; blob URL swap se stable preview.
                if (objectUrl) {
                  try {
                    URL.revokeObjectURL(objectUrl);
                  } catch {
                    /* ignore */
                  }
                }
                objectUrl = URL.createObjectURL(probe);
                setFileInfo((prev) => ({
                  ...prev,
                  type: "image",
                  formatLabel:
                    prev.formatLabel === "FILE" || prev.formatLabel === "OTHER"
                      ? "IMAGE"
                      : prev.formatLabel,
                  url: objectUrl,
                }));
              }
            } catch {
              /* background sniff best-effort */
            }
          })();
          return;
        }
        const isStorageObjectPath = looksLikeFirebaseStorageObjectPath(file);
        resolvedUrl = isStorageObjectPath ? null : file;
        if (isStorageObjectPath) {
          try {
            // Broken relative path flicker avoid: raw `voucher-files/...` ko pehle offline cache/native ref se resolve karo.
            const nativeCached = isCapacitorNativeApp()
              ? await getOfflineCachedAttachmentNativeRef(file)
              : null;
            if (nativeCached?.displayUrl) {
              resolvedUrl = nativeCached.displayUrl;
              const ct = String(nativeCached.contentType || "").toLowerCase();
              if (ct.includes("pdf")) resolvedType = "pdf";
              else if (ct.startsWith("image/")) resolvedType = "image";
            } else {
              // Raw object-path (`voucher-files/...`) ke liye cache miss par SDK fetch + cache write try karo.
              let cachedBlob = await getOfflineCachedAttachmentBlob(file);
              if ((!cachedBlob || cachedBlob.size === 0) && !controller.signal.aborted) {
                cachedBlob = await getRemoteAttachmentBlobPreferOfflineCache(file, controller.signal);
              }
              if (cachedBlob && cachedBlob.size > 0) {
                const kind = await sniffBlobKindForPreview(cachedBlob);
                if (kind === "image" || kind === "pdf") {
                  objectUrl = URL.createObjectURL(cachedBlob);
                  resolvedUrl = objectUrl;
                  resolvedType = kind;
                }
              }
            }
          } catch {
            /* cache miss; keep fallback flow */
          }
          logFilePreviewForensic("object_path_branch_result", {
            originalFile: file,
            resolvedUrl,
            resolvedType,
            isStorageObjectPath,
          });
        }
        // blob: — URL extension/label PDF nahi batata; fetch + MIME ya %PDF header (local voucher hover fix)
        if (file.startsWith("blob:")) {
          try {
            const b = await fetch(file).then((r) => r.blob());
            const kind = await sniffBlobKindForPreview(b);
            if (kind === "pdf") resolvedType = "pdf";
            else if (kind === "image") resolvedType = "image";
          } catch {
            /* revoked / network — neeche URL-based fallback */
          }
        }
        /* `local:` — Native par direct file-path URL, web/electron par blob/objectURL fallback. */
        if (file.startsWith(LOCAL_FILE_PREFIX)) {
          try {
            // Native fast-path: sync cache hit ho to zero-await URL set.
            const localMetaSync = isCapacitorNativeApp() ? getLocalFileRefMetaSync(file) : null;
            const localMeta =
              localMetaSync ||
              (isCapacitorNativeApp() ? await getLocalFileRefMeta(file) : null);
            const payload =
              isCapacitorNativeApp()
                ? null
                : localMeta?.displayUrl
                ? null
                : await getPendingPayloadForLocalRef(file);
            const b = payload?.blob;
            localFormatHint =
              getAttachmentFormatLabelFromHints(localMeta?.fileName || payload?.fileName, localMeta?.contentType || payload?.contentType) ||
              (b ? getAttachmentFormatLabelFromHints(null, b.type || null) : null);
            if (localMeta?.displayUrl) {
              if (localMeta.fileName) {
                try {
                  resolvedName = decodeURIComponent(String(localMeta.fileName));
                } catch {
                  resolvedName = String(localMeta.fileName);
                }
              }
              if ((localMeta.contentType || "").toLowerCase().includes("pdf")) {
                resolvedType = "pdf";
              } else if ((localMeta.contentType || "").toLowerCase().startsWith("image/")) {
                resolvedType = "image";
              }
              // APK/native: direct `convertFileSrc(uri)` path; JS bridge read avoid.
              resolvedUrl = localMeta.displayUrl;
            } else if (b && b.size > 0) {
              if (payload?.fileName) {
                try {
                  resolvedName = decodeURIComponent(String(payload.fileName));
                } catch {
                  resolvedName = String(payload.fileName);
                }
              }
              const kind = await sniffBlobKindForPreview(b);
              if (kind === "pdf") {
                resolvedType = "pdf";
              } else if (kind === "image") {
                resolvedType = "image";
                objectUrl = URL.createObjectURL(b);
                resolvedUrl = objectUrl;
              }
            }
          } catch {
            /* pending missing */
          }
          if (typeof file === "string" && file.startsWith(LOCAL_FILE_PREFIX)) {
            logFilePreviewForensic("local_ref_branch_result", {
              originalFile: file,
              resolvedUrl,
              resolvedType,
            });
          }
        }
        // Drive ref: blob download karke preview type detect karo, taaki second device par bhi attachment dikh sake.
        if (isDriveFileRef(file)) {
          try {
            // Offline preload cache → pending `local:` → Drive (turant preview / edit jaisa).
            const b =
              (await getRemoteAttachmentBlobPreferOfflineCache(file, controller.signal)) ||
              (await getBlobFromLocalFileRef(file));
            if (b && b.size > 0) {
              const kind = await sniffBlobKindForPreview(b);
              if (kind === "pdf") resolvedType = "pdf";
              else if (kind === "image") {
                resolvedType = "image";
                objectUrl = URL.createObjectURL(b);
                resolvedUrl = objectUrl;
              } else {
                resolvedType = "other";
              }
              resolvedName = file.split("/").pop() || "file";
            }
          } catch {
            /* drive fetch fail — fallback remains generic */
          }
        }
        if (resolvedType === "other") {
          /** URL ma literal `.pdf` na ho (encoded path) — badge jaisa hi label se type (gallery mobile PDF open fix) */
          const lblEarly = getAttachmentFormatLabel(file);
          if (lblEarly === "PDF" || file.startsWith("data:application/pdf")) {
            resolvedType = "pdf";
          } else if (
            file.startsWith("data:image/") ||
            ["JPG", "JPEG", "PNG", "GIF", "WEBP", "BMP", "SVG", "HEIC", "HEIF"].includes(lblEarly)
          ) {
            resolvedType = "image";
          } else {
            const cleanUrl = file.split("?")[0].toLowerCase();
            if (cleanUrl.endsWith(".pdf")) {
              resolvedType = "pdf";
            } else if (cleanUrl.match(/\.(jpeg|jpg|gif|png|webp|bmp|svg)(\?|$)/)) {
              resolvedType = "image";
            }
          }
          /** HTTPS link: URL se type na nikle (query-only, encoded path, non-.pdf path) — sniff se PDF/image branch */
          if (resolvedType === "other" && /^https?:\/\//i.test(file)) {
            try {
              let probe: Blob | null = null;
              try {
                const r = await fetch(file, {
                  mode: "cors",
                  credentials: "omit",
                  signal: controller.signal,
                  headers: { Range: "bytes=0-16383" },
                });
                if ((r.ok || r.status === 206) && !controller.signal.aborted) {
                  probe = await r.blob();
                }
              } catch {
                /* Range/CORS — neeche pura blob */
              }
              if ((!probe || probe.size === 0) && !controller.signal.aborted) {
                // Warm-sync cache pehle; phir lamba fallback (full warm IndexedDB offline sniff)
                probe = await getRemoteAttachmentBlobPreferOfflineCache(file, controller.signal);
              }
              if ((!probe || probe.size === 0) && !controller.signal.aborted) {
                probe = await fetchBlobWithTimeout(file, PDF_REMOTE_FETCH_TIMEOUT_MS, controller.signal);
              }
              if (probe && probe.size > 0 && !controller.signal.aborted) {
                const kind = await sniffBlobKindForPreview(probe);
                if (kind === "pdf") {
                  resolvedType = "pdf";
                } else if (kind === "image") {
                  resolvedType = "image";
                  // Offline: `<Image src={https}>` fail; IndexedDB warm → pura blob; Range probe aksar kata hua JPEG
                  let imgBlob: Blob | null =
                    (await getRemoteAttachmentBlobPreferOfflineCache(file, controller.signal)) ||
                    probe;
                  if ((!imgBlob || imgBlob.size === 0) && !controller.signal.aborted) {
                    imgBlob = await fetchBlobWithTimeout(file, PDF_REMOTE_FETCH_TIMEOUT_MS, controller.signal);
                  }
                  if (imgBlob && imgBlob.size > 0 && !controller.signal.aborted) {
                    const imgKind = await sniffBlobKindForPreview(imgBlob);
                    if (imgKind === "image") {
                      objectUrl = URL.createObjectURL(imgBlob);
                      resolvedUrl = objectUrl;
                    }
                  }
                }
              }
            } catch {
              /* preview niche PDF path try nahi karega */
            }
          }
        }
        // `.jpg`/label se `image` ho gaya par HTTPS probe skip — `resolvedUrl` ab bhi remote; offline preview fix
        if (
          typeof file === "string" &&
          /^https?:\/\//i.test(file) &&
          resolvedType === "image" &&
          resolvedUrl === file
        ) {
          const navOn = typeof navigator !== "undefined" && navigator.onLine;
          // Electron online: remote URL pehle — tez decode; Capacitor online bhi (warm miss par background branch cover).
          if (navOn && isElectronDesktopApp()) {
            /* resolvedUrl === file unchanged */
          } else if (navOn && isCapacitorNativeApp()) {
            /* online APK: HTTPS first paint; offline case upar warmEarly se handle */
          } else {
            // Web offline / Capacitor offline jahan ab bhi raw URL bacha ho — sirf cache/blob, network mat
            try {
              const imgBlob =
                (await getOfflineCachedAttachmentBlob(file)) ||
                (navOn ? await getRemoteAttachmentBlobPreferOfflineCache(file, controller.signal) : null) ||
                (navOn ? await fetchBlobWithTimeout(file, PDF_REMOTE_FETCH_TIMEOUT_MS, controller.signal) : null);
              if (imgBlob && imgBlob.size > 0 && !controller.signal.aborted) {
                const imgKind = await sniffBlobKindForPreview(imgBlob);
                if (imgKind === "image") {
                  if (objectUrl) URL.revokeObjectURL(objectUrl);
                  objectUrl = URL.createObjectURL(imgBlob);
                  resolvedUrl = objectUrl;
                }
              }
            } catch {
              /* cache/network — icon fallback */
            }
          }
        }
        // Save ke turant baad: IndexedDB blob `syncPendingFiles` hata chuka ho, form abhi `local:` string dikhata ho — Firestore HTTPS se thumb restore (openAttachmentInApp jaisa).
        if (
          !resolvedUrl &&
          typeof file === "string" &&
          file.startsWith(LOCAL_FILE_PREFIX) &&
          voucherAttachmentFb?.companyId &&
          voucherAttachmentFb?.voucherId
        ) {
          try {
            const clientList =
              attachmentClientFileUrls ??
              (attachmentGallery?.urls && attachmentGallery.urls.length > 0
                ? [...attachmentGallery.urls]
                : undefined);
            const remote = await tryResolveRemoteUrlForStaleLocalAttachment(
              voucherAttachmentFb.companyId,
              voucherAttachmentFb.voucherId,
              file,
              clientList
            );
            let openUrl = remote && !isLocalFileRef(remote) ? remote : null;
            if (!openUrl && voucherAttachmentFb.interCompanyPeer) {
              const peerUrl = await tryResolveInterCompanyPeerAttachmentUrl({
                staleUrl: file,
                clientFileUrls: clientList,
                peerCompanyId: voucherAttachmentFb.interCompanyPeer.peerCompanyId,
                peerVoucherId: voucherAttachmentFb.interCompanyPeer.peerVoucherId,
              });
              if (peerUrl && !isLocalFileRef(peerUrl)) openUrl = peerUrl;
            }
            if (openUrl) {
              let probe: Blob | null = await getOfflineCachedAttachmentBlob(openUrl);
              const navOn =
                typeof navigator !== "undefined" && (navigator.onLine || isCapacitorNativeApp());
              if ((!probe || probe.size === 0) && navOn && !controller.signal.aborted) {
                probe = await getRemoteAttachmentBlobPreferOfflineCache(openUrl, controller.signal);
              }
              if (probe && probe.size > 0 && !controller.signal.aborted) {
                objectUrl = URL.createObjectURL(probe);
                resolvedUrl = objectUrl;
                const kind = await sniffBlobKindForPreview(probe);
                if (kind === "pdf") resolvedType = "pdf";
                else if (kind === "image") resolvedType = "image";
                else resolvedType = "other";
              } else if (navOn && /^https?:\/\//i.test(openUrl)) {
                resolvedUrl = openUrl;
                const lbl = getAttachmentFormatLabel(openUrl);
                const cleanUrl = openUrl.split("?")[0].toLowerCase();
                if (lbl === "PDF" || cleanUrl.endsWith(".pdf") || cleanUrl.includes(".pdf")) {
                  resolvedType = "pdf";
                } else if (
                  ["JPG", "JPEG", "PNG", "GIF", "WEBP", "BMP", "SVG", "HEIC", "HEIF"].includes(lbl) ||
                  cleanUrl.match(/\.(jpeg|jpg|gif|png|webp|bmp|svg)(\?|$)/)
                ) {
                  resolvedType = "image";
                } else {
                  resolvedType = "image";
                }
              }
              try {
                resolvedName = decodeURIComponent(openUrl.split("/").pop()?.split("?")[0] || "file");
              } catch {
                resolvedName = openUrl.split("/").pop()?.split("?")[0] || "file";
              }
            }
          } catch {
            /* stale-resolve best-effort */
          }
        }
        // Render safety: URL source null ho to image/pdf force na karo; warna voucher edit me broken thumbnail flicker hota hai.
        if (!resolvedUrl) {
          resolvedType = "other";
          logAttachmentPreviewDowngradeToGenericFile(
            "final_guard_resolvedUrl_null_force_type_other",
            file,
            null,
            "other",
            {
              typeofFile: typeof file === "string" ? "string" : "file",
            }
          );
        }
        try {
          resolvedName = decodeURIComponent(file.split("/").pop()?.split("?")[0] || "file");
        } catch (e) {
          console.error("Could not decode file name", e);
        }
      } else if (file instanceof File) {
        fileObject = file;
        objectUrl = URL.createObjectURL(file);
        resolvedUrl = objectUrl;
        resolvedName = file.name;
        resolvedSize = file.size;
        if (file.type.startsWith("image/")) {
          resolvedType = "image";
        } else if (file.type === "application/pdf") {
          resolvedType = "pdf";
        } else if (!file.type || file.type === "application/octet-stream") {
          // Naye pick / SQLite restore — kabhi `type` khali hota hai; %PDF se PDF branch
          const kind = await sniffBlobKindForPreview(file);
          if (kind === "pdf") resolvedType = "pdf";
          else if (kind === "image") resolvedType = "image";
        }
      }

      // `local:` / hints se asli JPEG-PDF label; warna URL/File helper
      let formatLabel = getAttachmentFormatLabel(typeof file === "string" ? file : file);
      if (localFormatHint) formatLabel = localFormatHint;
      if (resolvedType === "pdf") formatLabel = "PDF";
      else if (resolvedType === "image" && (formatLabel === "FILE" || formatLabel === "IMAGE")) {
        formatLabel = localFormatHint || "IMAGE";
      }

      setFileInfo({
        url: resolvedUrl,
        type: resolvedType,
        name: resolvedName,
        size: resolvedSize,
        formatLabel,
      });
      setIsLoading(false);

      logFilePreviewForensic("final_ui_state_after_setFileInfo", {
        originalFile: typeof file === "string" ? file : file.name,
        resolvedUrl,
        resolvedType,
        formatLabel,
        finalUiKind:
          resolvedType === "image" && resolvedUrl
            ? "image"
            : resolvedType === "pdf"
              ? "pdf"
              : !resolvedUrl
                ? "generic_FILE_or_null_url"
                : "other_non_image_pdf_with_url",
      });

      if (resolvedType === "pdf") {
        setPdfThumbnailSafe(null); // clear previous so loading shows for this PDF
        // Rerender churn me turant regenerate mat karo; short debounce se duplicate work kam hota hai.
        const PDF_THUMB_DEBOUNCE_MS = 120;
        if (fileObject) {
          pdfThumbDebounceTimer = setTimeout(() => {
            if (!controller.signal.aborted) {
              generatePdfThumbnail(resolvedUrl!, fileObject!, undefined, controller.signal);
            }
          }, PDF_THUMB_DEBOUNCE_MS);
        } else if (resolvedUrl) {
          // resolvedStoragePath: voucher download URLs par getBlob (CORS se behtar)
          pdfThumbDebounceTimer = setTimeout(() => {
            if (!controller.signal.aborted) {
              generatePdfThumbnail(resolvedUrl, undefined, resolvedStoragePath, controller.signal);
            }
          }, PDF_THUMB_DEBOUNCE_MS);
        }
      } else {
        setPdfThumbnailSafe(null);
      }
    };

    processFile();

    // Purana 3s abort = thumbnail kaam karte PDF bhi cut; lamba safety net = sirf asli hang
    const timeoutId = setTimeout(() => controller.abort(), PDF_THUMBNAIL_EFFECT_HARD_ABORT_MS);

    return () => {
      clearTimeout(timeoutId);
      if (pdfThumbDebounceTimer) clearTimeout(pdfThumbDebounceTimer);
      controller.abort();
      // Revoke turant mat: React/`<Image>` abhi `src` read kar chuka ho — next macrotick pe revoke = `blob:` GET fail kam.
      const revokeLater = objectUrl;
      if (revokeLater) {
        setTimeout(() => {
          try {
            URL.revokeObjectURL(revokeLater);
          } catch {
            /* ignore */
          }
        }, 0);
      }
      const thumb = thumbnailUrlRef.current;
      if (thumb && !pdfThumbBlobIsCached(thumb)) revokeThumbnailUrl(thumb);
      thumbnailUrlRef.current = null;
      setPdfThumbnail(null);
    };
  }, [
    file,
    fileSize,
    resolvedStoragePath,
    layoutW,
    layoutH,
    generatePdfThumbnail,
    setPdfThumbnailSafe,
    revokeThumbnailUrl,
    voucherAttachmentFbFingerprint,
    attachmentClientUrlsFingerprint,
    attachmentGalleryFingerprint,
  ]);

  /** Thumbnail click + hover portal par double-click = browser / in-app open (same rules) */
  const canHoldCopyAttachment =
    holdAttachmentClipboard &&
    !disabled &&
    ((typeof file === "string" && String(file).trim().length > 0) || file instanceof File);

  /** Touch vs mouse — mobile par hold se Copy chip, desktop par hover + optional 2s hold copy */
  const tapInteractionMode = useTapInteractionMode();
  const [mobileCopyRevealed, setMobileCopyRevealed] = useState(false);

  /** Long-press + desktop hover par Copy button — ek hi payload/toast path; HTTPS ho to clipboard me link + session me PL paste. */
  const runHoldCopyNow = useCallback(async () => {
    const payload = buildHoldPayloadFromPreviewSource({
      file: file as File | string,
      storagePath: resolvedStoragePath,
    });
    if (!payload) return;
    const httpsFromProp =
      typeof file === "string" && /^https?:\/\//i.test(String(file).trim()) ? String(file).trim() : undefined;
    const httpsFromResolved =
      viewFileInfo.url && /^https?:\/\//i.test(String(viewFileInfo.url)) ? String(viewFileInfo.url) : undefined;
    const clipboardDisplayUrl = httpsFromProp ?? httpsFromResolved;
    const ok = await writeAttachmentHoldClipboard(payload, { clipboardDisplayUrl });
    refreshAttachmentHoldSessionBackup(payload);
    sonnerToast.success(ok ? "Copied" : "Saved for paste in this tab", {
      description: ok
        ? clipboardDisplayUrl
          ? "Paste on empty slot reuses the same file (no new upload)."
          : "Paste reuses saved attachment when possible; unsaved file uploads as new copy."
        : "Clipboard blocked — try Paste on empty slot (uses last copy in this tab).",
    });
    setMobileCopyRevealed(false);
  }, [file, resolvedStoragePath, viewFileInfo.url]);

  const copyAttachmentHold = useAttachmentHoldPointer({
    disabled: !canHoldCopyAttachment,
    holdMs: tapInteractionMode ? ATTACHMENT_HOLD_MS_MOBILE : ATTACHMENT_HOLD_MS_DESKTOP,
    onHoldComplete: tapInteractionMode
      ? () => {
          setMobileCopyRevealed(true);
        }
      : runHoldCopyNow,
  });

  const openAttachmentFromFileInfo = useCallback(() => {
    if (!viewFileInfo.url) return;
    const kind = viewFileInfo.type === "pdf" ? "pdf" : viewFileInfo.type === "image" ? "image" : "other";
    const g =
      attachmentGallery && attachmentGallery.urls.length > 1
        ? { urls: attachmentGallery.urls, startIndex: attachmentGallery.startIndex }
        : undefined;
    const clientList =
      attachmentClientFileUrls ??
      (attachmentGallery?.urls && attachmentGallery.urls.length > 0 ? [...attachmentGallery.urls] : undefined);
    const serverFallback =
      voucherAttachmentFb &&
      voucherAttachmentFb.companyId &&
      voucherAttachmentFb.voucherId &&
      (isLocalFileRef(viewFileInfo.url) || voucherAttachmentFb.interCompanyPeer)
        ? {
            companyId: voucherAttachmentFb.companyId,
            voucherId: voucherAttachmentFb.voucherId,
            clientFileUrls: clientList,
            interCompanyPeer: voucherAttachmentFb.interCompanyPeer,
          }
        : undefined;
    void openAttachmentInApp(viewFileInfo.url, { title: viewFileInfo.name, kind, gallery: g, serverFallback });
  }, [
    viewFileInfo.url,
    viewFileInfo.type,
    viewFileInfo.name,
    attachmentGalleryFingerprint,
    attachmentClientUrlsFingerprint,
    voucherAttachmentFbFingerprint,
  ]);

  const handlePreviewClick = (e: React.MouseEvent) => {
    if (children || (disabled && !allowPreviewWhenDisabled)) return;
    /* Mobile: Copy chip khula ho to short tap se file open na ho — sirf Copy dabayein */
    if (tapInteractionMode && mobileCopyRevealed) return;
    e.preventDefault();
    e.stopPropagation();
    openAttachmentFromFileInfo();
  };

  // Avatar par bhi hover preview (user); children / explicit off = nested-tooltip se bacho
  const showHoverFullPreview =
    enableHoverFullPreview &&
    !children &&
    Boolean(viewFileInfo.url) &&
    !viewIsLoading &&
    (viewFileInfo.type === "image" || viewFileInfo.type === "pdf");

  const ThumbnailContent = () => {
    if (viewIsLoading || (viewFileInfo.type === "pdf" && isPdfLoading && !pdfThumbnail)) {
      return <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />;
    }
    
    switch (viewFileInfo.type) {
      case "image":
        return (
          children ||
          (isBlobOrDataDisplayUrl(viewFileInfo.url) ? (
            // eslint-disable-next-line @next/next/no-img-element -- blob:/data: Next Image se `ERR_FILE_NOT_FOUND` race
            <img
              src={viewFileInfo.url!}
              alt={viewFileInfo.name}
              className={cn(
                "absolute inset-0 h-full w-full",
                objectFit === "contain" ? "object-contain" : "object-cover"
              )}
            />
          ) : (
            <Image
              src={viewFileInfo.url!}
              alt={viewFileInfo.name}
              fill
              sizes={`${layoutMaxEdge}px`}
              className={objectFit === "contain" ? "object-contain" : "object-cover"}
              unoptimized
            />
          ))
        );
      case "pdf":
        // Show PDF thumbnail if available, otherwise show icon
        if (pdfThumbnail) {
          return (
            children ||
            (isBlobOrDataDisplayUrl(pdfThumbnail) ? (
              // eslint-disable-next-line @next/next/no-img-element -- PDF first-page thumb = object URL
              <img
                src={pdfThumbnail}
                alt={viewFileInfo.name}
                className={cn(
                  "absolute inset-0 h-full w-full",
                  objectFit === "contain" ? "object-contain" : "object-cover"
                )}
              />
            ) : (
              <Image
                src={pdfThumbnail}
                alt={viewFileInfo.name}
                fill
                sizes={`${layoutMaxEdge}px`}
                className={objectFit === "contain" ? "object-contain" : "object-cover"}
                unoptimized
              />
            ))
          );
        }
        // Fallback to icon if thumbnail generation fails
        return (
          <div className="flex h-full w-full flex-col items-center justify-center bg-red-50 text-red-500">
            <FileText className="h-8 w-8 mb-1" />
            <span className="text-[12px] font-black leading-none">PDF</span>
          </div>
        );
      default:
        return children || (
          <div className="flex h-full w-full flex-col items-center justify-center bg-slate-50 text-slate-500">
            <FileText className="h-8 w-8" />
            <span className="mt-1 text-xs font-bold uppercase">File</span>
          </div>
        );
    }
  };
  
  const reduction = compressionResult
    ? (((compressionResult.originalSize - compressionResult.compressedSize) / compressionResult.originalSize) * 100).toFixed(0)
    : 0;
    
  const showSpinner = isCompressingProp || viewIsLoading;

  /** Hold handlers thumbnail par — touch target; browser long-press menu band */
  const thumbHoldHandlers = canHoldCopyAttachment
    ? {
        onPointerDown: copyAttachmentHold.onPointerDown,
        onPointerMove: copyAttachmentHold.onPointerMove,
        onPointerUp: copyAttachmentHold.onPointerUp,
        onPointerCancel: copyAttachmentHold.onPointerCancel,
        onPointerLeave: copyAttachmentHold.onPointerLeave,
        onClickCapture: copyAttachmentHold.onClickCapture,
        onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
      }
    : {};

  // Thumbnail box: hover tooltip ke andar bhi yahi layout (preview + badge + compression strip)
  const borderedPreview = (
    <div
      className={cn(
        "relative w-full h-full border rounded-lg overflow-hidden bg-background shadow-sm flex items-center justify-center touch-manipulation",
        disabled && !allowPreviewWhenDisabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
        disabled && allowPreviewWhenDisabled && "opacity-90"
      )}
      onClick={children || (disabled && !allowPreviewWhenDisabled) ? undefined : handlePreviewClick}
      {...thumbHoldHandlers}
    >
      <ThumbnailContent />

      {showSpinner && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-10">
          <Loader2 className="h-6 w-6 animate-spin text-white" />
        </div>
      )}
      {/* Compression strip ke upar corner label taaki dono dikhein */}
      {showFormatBadge && viewFileInfo.formatLabel && !showSpinner && (
        <span
          className={cn(
            "pointer-events-none absolute z-[12] rounded bg-black/55 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white",
            compressionResult ? "bottom-5 left-1" : "bottom-1 left-1"
          )}
        >
          {viewFileInfo.formatLabel}
        </span>
      )}
      {compressionResult && (
        <div className="absolute bottom-0 left-0 right-0 z-10 bg-emerald-600/90 py-0.5 text-center text-[10px] font-medium text-white">
          -{reduction}%
        </div>
      )}
    </div>
  );

  /** PC hover par Copy — mobile par `tapInteractionMode` se alag chip */
  const finePointerCopyBar = canHoldCopyAttachment && !tapInteractionMode ? (
    <div className="pointer-events-none absolute inset-0 z-[60] flex items-start justify-center gap-1 bg-transparent pt-0.5 opacity-0 transition-opacity group-hover:opacity-100">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="pointer-events-auto h-7 gap-0.5 px-2 text-[10px] font-semibold shadow-md"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          void runHoldCopyNow();
        }}
      >
        <Copy className="h-3 w-3 shrink-0" aria-hidden />
        Copy
      </Button>
    </div>
  ) : null;

  /** Mobile: ~1s hold ke baad Copy chip; click se copy (PC hover jaisa) */
  const mobileCopyBar =
    canHoldCopyAttachment && tapInteractionMode && mobileCopyRevealed ? (
      <div className="pointer-events-none absolute inset-0 z-[60] flex items-start justify-center gap-1 bg-transparent pt-0.5">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="pointer-events-auto h-7 gap-0.5 px-2 text-[10px] font-semibold shadow-md"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            void runHoldCopyNow();
          }}
        >
          <Copy className="h-3 w-3 shrink-0" aria-hidden />
          Copy
        </Button>
      </div>
    ) : null;

  // Hover popup: PDF ke liye nested FilePreview mat chalao — dubara fetch + chhota timeout; wahi raster thumb bara dikhao
  const hoverPanel =
    viewFileInfo.type === "image" && viewFileInfo.url ? (
      // eslint-disable-next-line @next/next/no-img-element -- portal max-h + object-contain = screen fit
      <img
        src={viewFileInfo.url}
        alt=""
        draggable={false}
        className="h-auto w-auto max-h-none max-w-none object-contain"
        onDoubleClick={(e) => {
          e.stopPropagation();
          openAttachmentFromFileInfo();
        }}
      />
    ) : viewFileInfo.type === "pdf" && pdfThumbnail ? (
      // eslint-disable-next-line @next/next/no-img-element -- PDF first page = cached blob URL, pdf.js dubara portal me nahi
      <img
        src={pdfThumbnail}
        alt=""
        draggable={false}
        className="h-auto w-auto max-h-none max-w-none object-contain"
        onDoubleClick={(e) => {
          e.stopPropagation();
          openAttachmentFromFileInfo();
        }}
      />
    ) : viewFileInfo.type === "pdf" && (isPdfLoading || viewIsLoading) ? (
      <div className="flex min-h-[280px] w-full flex-col items-center justify-center gap-2 px-4 py-8">
        <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" aria-hidden />
        <span className="text-xs text-muted-foreground">Loading PDF preview…</span>
      </div>
    ) : viewFileInfo.type === "pdf" && viewFileInfo.url ? (
      <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 px-4 py-6 text-center text-sm text-muted-foreground">
        <FileText className="h-12 w-12 shrink-0 opacity-50" aria-hidden />
        <span>Preview could not be generated</span>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => void openAttachmentInApp(viewFileInfo.url!, { title: viewFileInfo.name, kind: "pdf" })}
        >
          Open PDF
        </Button>
      </div>
    ) : (
      <FilePreview
        file={file}
        storagePath={resolvedStoragePath}
        size={HOVER_PREVIEW_MAX_PX}
        objectFit="contain"
        enableHoverFullPreview={false}
        showFormatBadge={false}
        disabled={disabled}
        fileSize={fileSize}
        isAvatar={isAvatar}
        holdAttachmentClipboard={false}
      />
    );

  return (
    <div
      className={cn("relative group h-full w-full", className)}
      style={
        fillsParentAttachSlot ? undefined : { width: `${layoutW}px`, height: `${layoutH}px` }
      }
    >
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRemove();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute -right-2 -top-2 z-[100] flex min-h-[28px] min-w-[28px] items-center justify-center rounded-full bg-red-500 p-1.5 text-white opacity-0 shadow-lg transition-opacity pointer-events-auto group-hover:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
      {showHoverFullPreview ? (
        <AttachmentHoverPortal
          triggerClassName="h-full w-full min-h-0 min-w-0"
          openOnHover={tapInteractionMode}
          onPreviewDoubleClick={
            viewFileInfo.type === "pdf" && viewFileInfo.url
              ? (e) => {
                  e.stopPropagation();
                  openAttachmentFromFileInfo();
                }
              : undefined
          }
          preview={
            <>
              {hoverPanel}
              <p className="pt-1 text-center text-[10px] font-semibold text-muted-foreground">
                {viewFileInfo.formatLabel}
              </p>
            </>
          }
        >
          <div className="relative h-full w-full min-h-0 min-w-0">
            {borderedPreview}
            {finePointerCopyBar}
            {mobileCopyBar}
          </div>
        </AttachmentHoverPortal>
      ) : (
        <div className="relative h-full w-full min-h-0 min-w-0">
          {borderedPreview}
          {finePointerCopyBar}
          {mobileCopyBar}
        </div>
      )}
    </div>
  );
}
