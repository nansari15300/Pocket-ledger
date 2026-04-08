"use client";

import * as React from "react";
import { useCallback, useEffect, useState, useRef } from "react";
import Image from "next/image";
import { FileText, Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { openAttachmentInApp } from "@/lib/openAttachmentInApp";
import { AttachmentHoverPortal } from "@/components/vouchers/AttachmentHoverPortal";
import { storage } from "@/lib/firebase";
import { ref, getBlob } from "firebase/storage";
import { getAttachmentFormatLabel } from "@/lib/attachmentFormatLabel";
import { tryGetStoragePathFromFirebaseDownloadUrl } from "@/lib/firebaseStorageDownloadUrl";

/** JPG seedha browser decode; PDF = download + pdf.js + canvas — 3–6s pehli baar normal. Dubara same URL tez ho: LRU cache. */
const PDF_THUMB_LRU_MAX = 40;
const pdfThumbLru = new Map<string, string>();

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

/** Hover FilePreview (portal preview) jiska previewBox 600×700 hai — wahi layoutMaxEdge=700 cache key */
const GALLERY_PDF_HOVER_THUMB_EDGE = 700;

/**
 * Gallery "Full preview" ON par current page ke PDF hovers ke liye pdf.js + pehla page pehle se cache me;
 * mouse le jate hi portal preview me turant thumb dikhe.
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
    const base = u.split("?")[0].toLowerCase();
    if (!base.endsWith(".pdf") && !u.startsWith("data:application/pdf")) continue;
    const ck = pdfThumbCacheKey(undefined, u, storagePath, GALLERY_PDF_HOVER_THUMB_EDGE);
    if (seen.has(ck)) continue;
    seen.add(ck);
    if (pdfThumbCacheGet(ck)) continue;
    try {
      let pdfFile: Blob;
      if (storagePath) {
        const storageRef = ref(storage, storagePath);
        pdfFile = await getBlob(storageRef);
      } else if (u.startsWith("http") || u.startsWith("blob:")) {
        const res = await fetch(u, { mode: "cors", signal });
        if (!res.ok) continue;
        pdfFile = await res.blob();
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
  disabled?: boolean; // Make preview non-clickable
  /** Firebase Storage path (e.g. companies/xxx/unassigned/yyy.pdf). When set, PDF thumbnail is loaded via SDK to avoid CORS/fetch failures. */
  storagePath?: string;
  /** object-contain = full image visible at best quality; object-cover = crop to fill (default). */
  objectFit?: "cover" | "contain";
  /**
   * Hover par transaction table jaisa bada preview (image / PDF). Band karo jahan nested tooltip ho (gallery, tooltip ke andar FilePreview).
   */
  enableHoverFullPreview?: boolean;
  /** Thumbnail ke corner par chhota PDF/JPEG text; forms + gallery ke liye default on. */
  showFormatBadge?: boolean;
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
  storagePath,
  objectFit = "cover",
  enableHoverFullPreview = true,
  showFormatBadge = true,
}: FilePreviewProps) {
  // URL-only props (e.g. gallery vouchers) par Firebase SDK se blob — fetch/CORS fail hone par bhi thumb mile
  const resolvedStoragePath = React.useMemo(() => {
    if (storagePath) return storagePath;
    if (typeof file === "string") return tryGetStoragePathFromFirebaseDownloadUrl(file) ?? undefined;
    return undefined;
  }, [file, storagePath]);

  const layoutW = previewBox?.width ?? size;
  const layoutH = previewBox?.height ?? size;
  const layoutMaxEdge = Math.max(layoutW, layoutH);

  const [fileInfo, setFileInfo] = useState<{
    url: string | null;
    type: "image" | "pdf" | "other";
    name: string;
    size: number | null;
    formatLabel: string;
  }>({ url: null, type: "other", name: "loading...", size: null, formatLabel: "" });

  const [isLoading, setIsLoading] = useState(true);
  const [pdfThumbnail, setPdfThumbnail] = useState<string | null>(null);
  const [isPdfLoading, setIsPdfLoading] = useState(false);
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

  // Thoda lamba timeout: pdf.js + pehla page render grid par aksar 3s+ leta hai; purana 3s = zyada cancel
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

      const run = async () => {
        const ck = pdfThumbCacheKey(
          fileObject instanceof File ? fileObject : undefined,
          pdfUrl,
          firebaseStoragePath,
          layoutMaxEdge
        );
        const cachedBlobUrl = pdfThumbCacheGet(ck);
        if (cachedBlobUrl) {
          setPdfThumbnailSafe(cachedBlobUrl);
          return;
        }

        setIsPdfLoading(true);
        let pdfFile: File | ArrayBuffer | Blob;

        if (fileObject instanceof File) {
          pdfFile = fileObject;
        } else if (firebaseStoragePath && storage) {
          const storageRef = ref(storage, firebaseStoragePath);
          pdfFile = await getBlob(storageRef);
        } else if (pdfUrl.startsWith("blob:")) {
          const response = await fetch(pdfUrl, { signal });
          pdfFile = await response.blob();
        } else if (pdfUrl.startsWith("http")) {
          const response = await fetch(pdfUrl, { mode: "cors", signal });
          if (!response.ok) throw new Error(`PDF fetch ${response.status}`);
          pdfFile = await response.blob();
        } else {
          setIsPdfLoading(false);
          return;
        }

        if (signal?.aborted) return;

        const { convertPdfFirstPageToImage } = await import("@/lib/pdfToImage");
        const result = await convertPdfFirstPageToImage(
          pdfFile,
          0.85,
          layoutMaxEdge > 150 ? 800 : 600,
          { signal }
        );

        if (signal?.aborted) {
          revokeThumbnailUrl(result.thumbnailUrl);
          return;
        }
        pdfThumbCacheSet(ck, result.thumbnailUrl);
        setPdfThumbnailSafe(result.thumbnailUrl);
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
    const controller = new AbortController();
    let fileObject: File | null = null;

    const processFile = async () => {
      setIsLoading(true);
      let resolvedUrl: string | null = null;
      let resolvedType: "image" | "pdf" | "other" = "other";
      let resolvedName = "file";
      let resolvedSize: number | null = fileSize ?? null;

      if (typeof file === "string") {
        resolvedUrl = file;
        const cleanUrl = file.split("?")[0].toLowerCase();
        if (cleanUrl.endsWith(".pdf") || file.startsWith("data:application/pdf")) {
          resolvedType = "pdf";
        } else if (cleanUrl.match(/\.(jpeg|jpg|gif|png|webp|bmp|svg)$/) || file.startsWith("data:image/")) {
          resolvedType = "image";
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
        }
      }

      // PDF/JPEG label: URL ya File dono se — gallery + badge ke liye same helper
      const formatLabel = getAttachmentFormatLabel(typeof file === "string" ? file : file);

      setFileInfo({
        url: resolvedUrl,
        type: resolvedType,
        name: resolvedName,
        size: resolvedSize,
        formatLabel,
      });
      setIsLoading(false);

      if (resolvedType === "pdf") {
        setPdfThumbnailSafe(null); // clear previous so loading shows for this PDF
        if (fileObject) {
          generatePdfThumbnail(resolvedUrl!, fileObject, undefined, controller.signal);
        } else if (resolvedUrl) {
          // resolvedStoragePath: voucher download URLs par getBlob (CORS se behtar)
          generatePdfThumbnail(resolvedUrl, undefined, resolvedStoragePath, controller.signal);
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
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      const thumb = thumbnailUrlRef.current;
      if (thumb && !pdfThumbBlobIsCached(thumb)) revokeThumbnailUrl(thumb);
      thumbnailUrlRef.current = null;
      setPdfThumbnail(null);
    };
  }, [file, fileSize, resolvedStoragePath, layoutW, layoutH, generatePdfThumbnail, setPdfThumbnailSafe, revokeThumbnailUrl]);

  const handlePreviewClick = (e: React.MouseEvent) => {
    if (children || disabled) return;
    e.preventDefault();
    e.stopPropagation();
    if (fileInfo.url) {
      // APK / static / mobile: overlay; desktop: nayi tab (openAttachmentInApp ke andar)
      const kind = fileInfo.type === "pdf" ? "pdf" : fileInfo.type === "image" ? "image" : "other";
      void openAttachmentInApp(fileInfo.url, { title: fileInfo.name, kind });
    }
  };

  // Avatar par bhi hover preview (user); children / explicit off = nested-tooltip se bacho
  const showHoverFullPreview =
    enableHoverFullPreview &&
    !children &&
    Boolean(fileInfo.url) &&
    !isLoading &&
    (fileInfo.type === "image" || fileInfo.type === "pdf");
  
  const ThumbnailContent = () => {
    if (isLoading || (fileInfo.type === "pdf" && isPdfLoading && !pdfThumbnail)) {
      return <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />;
    }
    
    switch (fileInfo.type) {
      case "image":
        return children || (
          <Image 
            src={fileInfo.url!} 
            alt={fileInfo.name} 
            fill 
            sizes={`${layoutMaxEdge}px`} 
            className={objectFit === "contain" ? "object-contain" : "object-cover"} 
            unoptimized 
          />
        );
      case "pdf":
        // Show PDF thumbnail if available, otherwise show icon
        if (pdfThumbnail) {
          return children || (
            <Image 
              src={pdfThumbnail} 
              alt={fileInfo.name} 
              fill 
              sizes={`${layoutMaxEdge}px`} 
              className={objectFit === "contain" ? "object-contain" : "object-cover"} 
              unoptimized 
            />
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
    
  const showSpinner = isCompressingProp || isLoading;

  // Thumbnail box: hover tooltip ke andar bhi yahi layout (preview + badge + compression strip)
  const borderedPreview = (
    <div
      className={cn(
        "relative w-full h-full border rounded-lg overflow-hidden bg-background shadow-sm flex items-center justify-center",
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
      )}
      onClick={children || disabled ? undefined : handlePreviewClick}
    >
      <ThumbnailContent />

      {showSpinner && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-10">
          <Loader2 className="h-6 w-6 animate-spin text-white" />
        </div>
      )}
      {/* Compression strip ke upar corner label taaki dono dikhein */}
      {showFormatBadge && fileInfo.formatLabel && !showSpinner && (
        <span
          className={cn(
            "pointer-events-none absolute z-[12] rounded bg-black/55 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white",
            compressionResult ? "bottom-5 left-1" : "bottom-1 left-1"
          )}
        >
          {fileInfo.formatLabel}
        </span>
      )}
      {compressionResult && (
        <div className="absolute bottom-0 left-0 right-0 z-10 bg-emerald-600/90 py-0.5 text-center text-[10px] font-medium text-white">
          -{reduction}%
        </div>
      )}
    </div>
  );

  // Bade hover panel: nested FilePreview par hover band — infinite tooltip na bane
  const hoverPanel =
    fileInfo.type === "image" && fileInfo.url ? (
      // eslint-disable-next-line @next/next/no-img-element -- tooltip ke andar Next/Image zaroori nahi
      <img
        src={fileInfo.url}
        alt=""
        className="max-h-[75vh] max-w-[800px] object-contain"
      />
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
      />
    );

  return (
    <div
      className={cn("relative group h-full w-full", className)}
      style={{ width: `${layoutW}px`, height: `${layoutH}px` }}
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
          preview={
            <div className="max-h-[85vh] max-w-[min(90vw,820px)] overflow-auto">
              {hoverPanel}
              <p className="pt-1 text-center text-[10px] font-semibold text-muted-foreground">
                {fileInfo.formatLabel}
              </p>
            </div>
          }
        >
          {borderedPreview}
        </AttachmentHoverPortal>
      ) : (
        borderedPreview
      )}
    </div>
  );
}
