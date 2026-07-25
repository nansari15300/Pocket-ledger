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
  getAttachmentPreviewKindFromHints,
  sniffBlobKindForPreview,
} from "@/lib/attachmentFormatLabel";
import {
  looksLikeFirebaseStorageObjectPath,
  normalizeFirebaseStorageObjectPathForSdk,
  tryGetStoragePathFromFirebaseDownloadUrl,
} from "@/lib/firebaseStorageDownloadUrl";
import {
  getOfflineCachedAttachmentBlob,
  getOfflineCachedAttachmentNativeRef,
  getRemoteAttachmentBlobPreferOfflineCache,
  tryOfflineCachedAttachmentBlobMultiKey,
} from "@/lib/offlineAttachmentUrlCache";
import {
  getBlobFromLocalFileRef,
  getLocalFileRefMeta,
  getLocalFileRefMetaSync,
  getPendingPayloadForLocalRef,
  isLocalFileRef,
  LOCAL_FILE_PREFIX,
} from "@/lib/localPendingFiles";
import { isDriveFileRef } from "@/lib/legacyDriveFileRef";
import { useVoucherAttachmentFallback } from "@/contexts/VoucherAttachmentFallbackContext";
import { tryResolveRemoteUrlForStaleLocalAttachment } from "@/lib/resolveVoucherAttachmentRemoteUrl";
import { getBlobFromAttachmentRefPreferLocalFirst } from "@/lib/attachmentPreviewResolve";
import { tryResolveInterCompanyPeerAttachmentUrl } from "@/lib/interCompany/interCompanyAttachmentPeerResolve";
import { isElectronDesktopApp } from "@/lib/isElectronDesktop";
import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";
import { usesEmbeddedNativeAttachmentStorage } from "@/lib/usesEmbeddedNativeAttachmentStorage";
import {
  useAttachmentHoldPointer,
  ATTACHMENT_HOLD_MS_MOBILE,
  ATTACHMENT_HOLD_MS_DESKTOP,
} from "@/hooks/useAttachmentHoldPointer";
import {
  buildHoldPayloadFromPreviewSource,
  normalizeAttachmentUrlForDevicePreview,
  writeAttachmentHoldClipboard,
  refreshAttachmentHoldSessionBackup,
} from "@/lib/attachmentHoldClipboard";
import { toast as sonnerToast } from "sonner";
import { useCrossCompanyAttachmentAccess } from "@/hooks/useCrossCompanyAttachmentAccess";
import { useCompany } from "@/hooks/useCompany";
import {
  companyAttachmentMode,
  companyRequiresLocalAttachmentUrlsOnly,
  prefersLocalAttachmentDisplayFirst,
  resolveStaticAttachmentDisplay,
} from "@/lib/staticAttachmentDisplayUrl";
import {
  collectAccessibleCompanyIdsForAttachmentPolicy,
  isCrossCompanyAttachmentVisibleToUser,
} from "@/lib/crossCompanyAttachmentAccess";
import { forgetHoverBlobUrl, peekHoverCachedBlobUrl, rememberHoverBlobUrl } from "@/lib/attachmentHoverBlobCache";
import {
  ensureAttachmentUiRefreshListeners,
  getAttachmentUrlLoadStatus,
  subscribeAttachmentLoadStore,
} from "@/lib/attachmentLoadReady";

/** Forensic: `NEXT_PUBLIC_ATTACHMENT_FORENSIC_DEBUG=1` — FilePreview branch + ATTACHMENT_PREVIEW_DOWNGRADE proof. */
const FILE_PREVIEW_FORENSIC =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_ATTACHMENT_FORENSIC_DEBUG === "1";

/** `next/image` + `blob:` / `data:` / signed HTTPS — portal hover `<img>` jaisa; Next/Image remotePatterns miss par edit thumb blank. */
function isBlobOrDataDisplayUrl(u: string | null | undefined): boolean {
  if (!u || typeof u !== "string") return false;
  if (u.startsWith("blob:") || u.startsWith("data:")) return true;
  if (/^https?:\/\//i.test(u)) return true;
  return false;
}

/** `local:` string preview URL nahi — blob / server fetch ke baad hi resolved. */
function isUnresolvedAttachmentPreviewUrl(url: string | null | undefined): boolean {
  return !url || isLocalFileRef(String(url || "").trim());
}

function logFilePreviewForensic(tag: string, payload: Record<string, unknown>) {
  if (!FILE_PREVIEW_FORENSIC) return;
  console.warn("[FORENSIC_FILE_PREVIEW]", { tag, ...payload });
}

/** Warmed LRU blob abhi paint-able hai? Revoked / dead blob → FilePreview broken `local:` alt. */
async function isUsableWarmedAttachmentDisplayUrl(displayUrl: string): Promise<boolean> {
  const u = String(displayUrl || "").trim();
  if (!u) return false;
  if (u.startsWith("data:")) return true;
  if (!u.startsWith("blob:")) {
    // Native convertFileSrc / https — fetch mat; sirf blob: revoke race check.
    return /^https?:\/\//i.test(u) || u.startsWith("capacitor:") || u.startsWith("file:");
  }
  try {
    const blob = await fetch(u).then((r) => r.blob());
    return Boolean(blob && blob.size > 0);
  } catch {
    return false;
  }
}

/** Web preview helper: `local:uuid` -> IndexedDB/Pending / PL staff fetch -> browser `blob:` URL. */
async function resolveLocalRefToBlobUrlForPreview(
  localRef: string,
  galleryUrls?: readonly string[],
  companyId?: string
): Promise<{ blob: Blob | null; blobUrl: string | null }> {
  try {
    const { getOfflineCachedAttachmentNativeRef } = await import("@/lib/offlineAttachmentUrlCache");
    const native = await getOfflineCachedAttachmentNativeRef(localRef);
    if (native?.displayUrl?.trim()) {
      return { blob: null, blobUrl: native.displayUrl.trim() };
    }
  } catch {
    /* optional */
  }
  const directLocal = await getBlobFromLocalFileRef(
    localRef,
    companyId ? { companyId } : undefined
  );
  if (directLocal && directLocal.size > 0) {
    return { blob: directLocal, blobUrl: URL.createObjectURL(directLocal) };
  }
  // Staff / server-company: local miss par `/__pl_attachment`.
  if (companyId) {
    try {
      const { resolvePlServerStaffAttachmentPreviewBlob } = await import("@/lib/plServerAttachmentFetch");
      const remote = await resolvePlServerStaffAttachmentPreviewBlob(localRef, {
        companyId,
        galleryUrls,
      });
      if (remote && remote.size > 0) {
        return { blob: remote, blobUrl: URL.createObjectURL(remote) };
      }
    } catch {
      /* fall through */
    }
  }
  const { getBlobFromAttachmentRefPreferLocalFirst } = await import("@/lib/attachmentPreviewResolve");
  const b = await getBlobFromAttachmentRefPreferLocalFirst(localRef, { galleryUrls, companyId });
  if (!b || b.size <= 0) return { blob: null, blobUrl: null };
  return { blob: b, blobUrl: URL.createObjectURL(b) };
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

function isImageFormatLabel(label: string | null | undefined): boolean {
  return ["JPG", "JPEG", "PNG", "GIF", "WEBP", "BMP", "SVG", "HEIC", "HEIF", "AVIF", "TIFF"].includes(
    String(label || "").toUpperCase()
  );
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
  signal?: AbortSignal,
  localAttachmentOnly = false
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
    // Voucher attachment `local:uuid` — gallery page can contain hundreds of local JPEGs.
    // Use saved metadata only; blob sniff here turns normal gallery idle into heavy disk/pdf work.
    if (!isPdfEntry && u.startsWith(LOCAL_FILE_PREFIX)) {
      try {
        const meta = await getLocalFileRefMeta(u);
        isPdfEntry =
          String(meta?.contentType || "").toLowerCase().includes("pdf") ||
          getAttachmentFormatLabelFromHints(meta?.fileName, meta?.contentType) === "PDF";
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
      if (storagePath && !localAttachmentOnly) {
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
          pdfFileHttp = await getRemoteAttachmentBlobPreferOfflineCache(u, signal, {
            localOnly: localAttachmentOnly,
          });
        }
        if (!pdfFileHttp || pdfFileHttp.size === 0) {
          if (localAttachmentOnly) continue;
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
  /** EXE/SQLite mirror tail (`27e15173%2Fpayment_out%2F…`) → `voucher-files/{companyId}/…` resolve */
  attachmentCompanyId?: string;
  /** Gallery local company: Firebase Storage/network mat chhedo — sirf cache + `local:`. */
  forceLocalAttachmentOnly?: boolean;
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
  attachmentCompanyId,
  forceLocalAttachmentOnly = false,
}: FilePreviewProps) {
  const voucherAttachmentFb = useVoucherAttachmentFallback();
  const { companyId: shellCompanyId, company } = useCompany();
  const { activeCompanyId, accessibleCompanyIds } = useCrossCompanyAttachmentAccess();
  // UI guard: koi stale PL marker aa jaye to preview/open path me underlying src (`local:`/https) use karo.
  const normalizedPreviewFile = React.useMemo(
    () => (typeof file === "string" ? normalizeAttachmentUrlForDevicePreview(file) : file),
    [file]
  );
  const fileRefForLoadStatus = typeof normalizedPreviewFile === "string" ? normalizedPreviewFile.trim() : "";
  /** Sirf is file ka ready/loading — global tick mat (gallery: ek file ready → 16 tiles blink). */
  const fileLoadStatus = React.useSyncExternalStore(
    subscribeAttachmentLoadStore,
    () =>
      fileRefForLoadStatus && isLocalFileRef(fileRefForLoadStatus)
        ? getAttachmentUrlLoadStatus(fileRefForLoadStatus)
        : "ready",
    () => "ready"
  );
  React.useEffect(() => {
    ensureAttachmentUiRefreshListeners();
  }, []);
  // Edit forms me fallback company id dene se Firebase object-path resolve stable rehta hai.
  const pathCompanyId = attachmentCompanyId ?? voucherAttachmentFb?.companyId ?? shellCompanyId ?? undefined;
  const localLedgerOnly = React.useMemo(
    () => forceLocalAttachmentOnly || companyRequiresLocalAttachmentUrlsOnly(company),
    [forceLocalAttachmentOnly, company]
  );
  const attachmentMode = React.useMemo(
    () => companyAttachmentMode(company, { localLedgerOnly }),
    [company, localLedgerOnly]
  );
  const preferLocalAttachmentFirst = React.useMemo(
    () => prefersLocalAttachmentDisplayFirst(company),
    [company]
  );
  const fileRef = typeof normalizedPreviewFile === "string" ? normalizedPreviewFile.trim() : "";
  const expandedAccessibleCompanyIds = React.useMemo(() => {
    const peerId = voucherAttachmentFb?.interCompanyPeer?.peerCompanyId;
    if (!peerId) return accessibleCompanyIds;
    return collectAccessibleCompanyIdsForAttachmentPolicy([], [peerId, ...[...accessibleCompanyIds]]);
  }, [accessibleCompanyIds, voucherAttachmentFb?.interCompanyPeer?.peerCompanyId]);
  const policyAllowsAttachmentView = React.useMemo(() => {
    if (!fileRef || isLocalFileRef(fileRef) || isDriveFileRef(fileRef)) return true;
    if (voucherAttachmentFb?.interCompanyPeer) return true;
    return isCrossCompanyAttachmentVisibleToUser(fileRef, activeCompanyId, expandedAccessibleCompanyIds);
  }, [
    fileRef,
    activeCompanyId,
    expandedAccessibleCompanyIds,
    voucherAttachmentFb?.interCompanyPeer,
  ]);
  const [offlineCacheReadable, setOfflineCacheReadable] = React.useState(false);
  React.useEffect(() => {
    if (!fileRef || policyAllowsAttachmentView) {
      setOfflineCacheReadable(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const { getOfflineCachedAttachmentBlob } = await import("@/lib/offlineAttachmentUrlCache");
        const blob = await getOfflineCachedAttachmentBlob(fileRef);
        if (!cancelled) setOfflineCacheReadable(Boolean(blob && blob.size > 0));
      } catch {
        if (!cancelled) setOfflineCacheReadable(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fileRef, policyAllowsAttachmentView]);
  const attachmentBlockedByCrossCompanyPolicy =
    Boolean(fileRef) &&
    !policyAllowsAttachmentView &&
    !offlineCacheReadable;

  // URL-only props (e.g. gallery vouchers) par Firebase SDK se blob — fetch/CORS fail hone par bhi thumb mile
  const resolvedStoragePath = React.useMemo(() => {
    if (storagePath) return storagePath;
    if (typeof file === "string") {
      const fromUrl = tryGetStoragePathFromFirebaseDownloadUrl(file);
      if (fromUrl) return fromUrl;
      const norm = normalizeFirebaseStorageObjectPathForSdk(file, { companyId: pathCompanyId });
      if (
        /^voucher-files\//i.test(norm) ||
        /^companies\//i.test(norm) ||
        /^entity-files\//i.test(norm)
      ) {
        return norm;
      }
    }
    return undefined;
  }, [file, storagePath, pathCompanyId]);

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

  /** `local:` + runtime displayUrl (EXE/APK disk OR web IDB putPendingFile blob URL) — spinner skip. */
  const immediateLocalInfo = React.useMemo(() => {
    if (!(typeof file === "string" && isLocalFileRef(file))) {
      return null;
    }
    const meta = getLocalFileRefMetaSync(file);
    if (!meta?.displayUrl) return null;
    let type: "image" | "pdf" | "other" = "other";
    const ct = String(meta.contentType || "").toLowerCase();
    const hintKind = getAttachmentPreviewKindFromHints(meta.fileName, meta.contentType);
    if (hintKind === "pdf" || ct.includes("pdf")) type = "pdf";
    else if (hintKind === "image" || ct.startsWith("image/")) type = "image";
    // Restore / pending: octet-stream + no extension → sync FILE icon mat paint; async sniff chalao.
    if (
      type === "other" &&
      (!ct || ct === "application/octet-stream" || ct === "binary/octet-stream")
    ) {
      return null;
    }
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
  const [previewTimedOut, setPreviewTimedOut] = React.useState(false);

  React.useEffect(() => {
    setPreviewTimedOut(false);
    const t = window.setTimeout(() => setPreviewTimedOut(true), 28_000);
    return () => window.clearTimeout(t);
  }, [normalizedPreviewFile]);

  const thumbnailUrlRef = useRef<string | null>(null);
  const pdfThumbnailKeyRef = useRef<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInfoRef = useRef(fileInfo);
  fileInfoRef.current = fileInfo;

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
  const PDF_THUMBNAIL_FETCH_RACE_MS = 28_000;
  /** Sirf stuck/hang: normal case me unmount se abort hota hai */
  const PDF_THUMBNAIL_EFFECT_HARD_ABORT_MS = 35_000;

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
      pdfThumbnailKeyRef.current = ck;

      const run = async (): Promise<string | null> => {
        const cachedBlobUrl = pdfThumbCacheGet(ck);
        if (cachedBlobUrl) {
          pdfThumbnailKeyRef.current = ck;
          setPdfThumbnailSafe(cachedBlobUrl);
          return cachedBlobUrl;
        }
        // Native/local path: persisted jpg thumb ho to PDF bytes read ki zaroorat nahi.
        if (isCapacitorNativeApp()) {
          const { getNativePdfThumbnailDisplayUrl } = await import("@/lib/pdfToImage");
          const nativeThumb = await getNativePdfThumbnailDisplayUrl(ck);
          if (nativeThumb) {
            pdfThumbCacheSet(ck, nativeThumb);
            pdfThumbnailKeyRef.current = ck;
            setPdfThumbnailSafe(nativeThumb);
            return nativeThumb;
          }
        }
        // Existing in-flight promise reuse — same key par dobara heavy render/fetch mat chalao.
        const existingInflight = pdfThumbInFlight.get(ck);
        if (existingInflight) {
          const reused = await existingInflight;
          if (reused) {
            pdfThumbnailKeyRef.current = ck;
            setPdfThumbnailSafe(reused);
          }
          return reused;
        }

        setIsPdfLoading(true);
        const job = (async (): Promise<string | null> => {
          let pdfFile: File | ArrayBuffer | Blob;

          if (fileObject instanceof File) {
            pdfFile = fileObject;
          } else if (firebaseStoragePath && storage && !localLedgerOnly) {
          // Pehle signed URL → SDK+fetch helper (CORS + naya `*.firebasestorage.app` host); phir direct getBlob — sirf getBlob+5s pe web "online" preview fail hota tha.
            let resolved: Blob | null = null;
            if (pdfUrl.startsWith("http")) {
            // Pehle warm-sync IndexedDB; phir SDK/getBlob path (helper se bytes background cache)
              resolved =
                (await tryOfflineCachedAttachmentBlobMultiKey(pdfUrl)) ||
                (await getRemoteAttachmentBlobPreferOfflineCache(pdfUrl, signal, { localOnly: localLedgerOnly }));
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
            const cid = String(pathCompanyId || voucherAttachmentFb?.companyId || "").trim();
            let blob = await getBlobFromLocalFileRef(pdfUrl, cid ? { companyId: cid } : undefined);
            if ((!blob || blob.size <= 0) && cid) {
              const { fetchPlServerAttachmentBlob } = await import("@/lib/plServerAttachmentFetch");
              blob = (await fetchPlServerAttachmentBlob(cid, pdfUrl, signal)) ?? null;
            }
            if (!blob || blob.size <= 0) {
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
            const hydrated =
              (await tryOfflineCachedAttachmentBlobMultiKey(pdfUrl)) ||
              (await getRemoteAttachmentBlobPreferOfflineCache(pdfUrl, signal, { localOnly: localLedgerOnly }));
            pdfFile =
              hydrated && hydrated.size > 0
                ? hydrated
                : localLedgerOnly
                  ? null
                  : await fetchBlobWithTimeout(pdfUrl, PDF_REMOTE_FETCH_TIMEOUT_MS, signal);
            if (!pdfFile) {
              setIsPdfLoading(false);
              return null;
            }
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
          pdfThumbnailKeyRef.current = ck;
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
    [layoutMaxEdge, pathCompanyId, voucherAttachmentFb?.companyId, revokeThumbnailUrl, setPdfThumbnailSafe, localLedgerOnly]
  );

  useEffect(() => {
    let objectUrl: string | null = null;
    let pdfThumbDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    const controller = new AbortController();
    let fileObject: File | null = null;

    const processFile = async () => {
      // Decode-on-read: effect ke andar bhi normalized file value use karo.
      const file = normalizedPreviewFile;
      const painted = fileInfoRef.current;
      if (
        typeof file === "string" &&
        painted.url &&
        !isUnresolvedAttachmentPreviewUrl(painted.url) &&
        painted.type !== "other"
      ) {
        return;
      }
      if (typeof file === "string") {
        const warmed = peekHoverCachedBlobUrl(file);
        // `local:` + revoked blob: early paint → broken img + alt=`local:uuid` (masters Edit Party).
        // Sirf usable warmed URL pe short-circuit; warna full resolve (PL staff fetch).
        if (warmed && !controller.signal.aborted && (await isUsableWarmedAttachmentDisplayUrl(warmed))) {
          let warmedType: "image" | "pdf" | "other" = "image";
          const lbl = getAttachmentFormatLabel(file);
          if (lbl === "PDF" || file.toLowerCase().includes(".pdf")) warmedType = "pdf";
          else if (isLocalFileRef(file) && (lbl === "FILE" || lbl === "OTHER" || !lbl)) {
            // local: extension nahi — sniff se type; default image mat (PDF masters broken).
            try {
              const probe = await fetch(warmed).then((r) => r.blob());
              const kind = await sniffBlobKindForPreview(probe);
              if (kind === "pdf") warmedType = "pdf";
              else if (kind === "image") warmedType = "image";
              else warmedType = "other";
            } catch {
              warmedType = "other";
            }
          }
          if (warmedType !== "other") {
            setFileInfo({
              url: warmed,
              type: warmedType,
              name:
                isLocalFileRef(file) || file.startsWith(LOCAL_FILE_PREFIX)
                  ? "Attachment"
                  : file.split("/").pop()?.split("?")[0] || "file",
              size: fileSize ?? null,
              formatLabel: warmedType === "pdf" ? "PDF" : lbl === "FILE" || lbl === "OTHER" ? "IMAGE" : lbl || "IMAGE",
            });
            setIsLoading(false);
            if (warmedType === "pdf") {
              pdfThumbDebounceTimer = setTimeout(() => {
                if (!controller.signal.aborted) {
                  generatePdfThumbnail(warmed, undefined, resolvedStoragePath, controller.signal);
                }
              }, 120);
            }
            return;
          }
          forgetHoverBlobUrl(file, warmed);
        } else if (warmed) {
          forgetHoverBlobUrl(file, warmed);
        }
      }
      let resolvedUrl: string | null = null;
      let resolvedType: "image" | "pdf" | "other" = "other";
      let resolvedName = "file";
      let resolvedSize: number | null = fileSize ?? null;
      let localFormatHint: string | null = null;

      try {
      /** EXE/APK: disk/SQLite cache pehle — spinner + HTTPS fetch avoid (online company bhi). */
      if (typeof file === "string" && preferLocalAttachmentFirst) {
        try {
          const staticResolved = await resolveStaticAttachmentDisplay(file, {
            localLedgerOnly,
            companyMode: attachmentMode,
            signal: controller.signal,
            companyId: pathCompanyId,
          });
          if (staticResolved.displayUrl || (staticResolved.blob && staticResolved.blob.size > 0)) {
            if (staticResolved.displayUrl) {
              resolvedUrl = staticResolved.displayUrl;
            } else if (staticResolved.blob) {
              objectUrl = URL.createObjectURL(staticResolved.blob);
              resolvedUrl = objectUrl;
            }
            const nativeCt = String(staticResolved.contentType || "").toLowerCase();
            try {
              resolvedName = decodeURIComponent(file.split("/").pop()?.split("?")[0] || "file");
            } catch {
              resolvedName = file.split("/").pop()?.split("?")[0] || "file";
            }
            const lbl = getAttachmentFormatLabel(file);
            const cleanUrl = file.split("?")[0].toLowerCase();
            if (nativeCt.includes("pdf")) resolvedType = "pdf";
            else if (nativeCt.startsWith("image/")) resolvedType = "image";
            else if (lbl === "PDF" || cleanUrl.endsWith(".pdf") || cleanUrl.includes(".pdf")) {
              resolvedType = "pdf";
            } else if (
              ["JPG", "JPEG", "PNG", "GIF", "WEBP", "BMP", "SVG", "HEIC", "HEIF", "AVIF", "TIFF"].includes(lbl) ||
              cleanUrl.match(/\.(jpe?g|jfif|gif|png|webp|bmp|svg|heic|heif|avif|tiff?)(\?|$)/i)
            ) {
              resolvedType = "image";
            }
            let formatLabel = getAttachmentFormatLabel(file);
            if (resolvedType === "pdf") formatLabel = "PDF";
            else if (resolvedType === "image" && (formatLabel === "FILE" || formatLabel === "OTHER")) {
              formatLabel = "IMAGE";
            }
            setFileInfo({
              url: resolvedUrl,
              type: resolvedType,
              name:
                resolvedName.startsWith(LOCAL_FILE_PREFIX) || isLocalFileRef(resolvedName)
                  ? "Attachment"
                  : resolvedName,
              size: resolvedSize,
              formatLabel,
            });
            setIsLoading(false);
            if (resolvedType === "pdf" && resolvedUrl) {
              pdfThumbDebounceTimer = setTimeout(() => {
                if (!controller.signal.aborted) {
                  generatePdfThumbnail(file, undefined, resolvedStoragePath, controller.signal);
                }
              }, 120);
            }
            return;
          }
        } catch {
          /* cache miss — legacy branches */
        }
        if (
          typeof file === "string" &&
          isLocalFileRef(file) &&
          pathCompanyId &&
          !controller.signal.aborted
        ) {
          try {
            const { resolvePlServerStaffAttachmentPreviewBlob, canFetchPlServerAttachmentForCompany } =
              await import("@/lib/plServerAttachmentFetch");
            if (canFetchPlServerAttachmentForCompany(pathCompanyId)) {
              const remoteBlob = await resolvePlServerStaffAttachmentPreviewBlob(file, {
                companyId: pathCompanyId,
                signal: controller.signal,
              });
              if (remoteBlob && remoteBlob.size > 0) {
                objectUrl = URL.createObjectURL(remoteBlob);
                rememberHoverBlobUrl(file, objectUrl);
                resolvedUrl = objectUrl;
                const kind = await sniffBlobKindForPreview(remoteBlob);
                if (kind === "pdf") resolvedType = "pdf";
                else if (kind === "image") resolvedType = "image";
                try {
                  resolvedName = decodeURIComponent(file.split("/").pop()?.split("?")[0] || "file");
                } catch {
                  resolvedName = file.split("/").pop()?.split("?")[0] || "file";
                }
                let formatLabel = getAttachmentFormatLabel(file);
                if (resolvedType === "pdf") formatLabel = "PDF";
                else if (resolvedType === "image") formatLabel = "IMAGE";
                setFileInfo({
                  url: resolvedUrl,
                  type: resolvedType,
                  name: resolvedName.startsWith(LOCAL_FILE_PREFIX) ? "Attachment" : resolvedName,
                  size: resolvedSize,
                  formatLabel,
                });
                setIsLoading(false);
                if (resolvedType === "pdf" && resolvedUrl) {
                  pdfThumbDebounceTimer = setTimeout(() => {
                    if (!controller.signal.aborted) {
                      generatePdfThumbnail(resolvedUrl!, undefined, resolvedStoragePath, controller.signal);
                    }
                  }, 120);
                }
                return;
              }
            }
          } catch {
            /* pl server early fetch */
          }
        }
      }

      setIsLoading(true);

      if (typeof file === "string") {
        if (/^https?:\/\//i.test(file) && !file.startsWith(LOCAL_FILE_PREFIX)) {
          const staticResolved = await resolveStaticAttachmentDisplay(file, {
            localLedgerOnly,
            companyMode: attachmentMode,
            signal: controller.signal,
            companyId: pathCompanyId,
          });
          let nativeCt = String(staticResolved.contentType || "").toLowerCase();
          if (staticResolved.displayUrl) {
            resolvedUrl = staticResolved.displayUrl;
          } else if (staticResolved.blob && staticResolved.blob.size > 0) {
            objectUrl = URL.createObjectURL(staticResolved.blob);
            resolvedUrl = objectUrl;
          } else if (
            typeof navigator !== "undefined" &&
            navigator.onLine &&
            (!localLedgerOnly || usesEmbeddedNativeAttachmentStorage())
          ) {
            resolvedUrl = file;
          } else {
            resolvedUrl = null;
          }
          try {
            resolvedName = decodeURIComponent(file.split("/").pop()?.split("?")[0] || "file");
          } catch {
            resolvedName = file.split("/").pop()?.split("?")[0] || "file";
          }
          const lbl = getAttachmentFormatLabel(file);
          const cleanUrl = file.split("?")[0].toLowerCase();
          if (nativeCt.includes("pdf")) {
            resolvedType = "pdf";
          } else if (nativeCt.startsWith("image/")) {
            resolvedType = "image";
          } else if (lbl === "PDF" || cleanUrl.endsWith(".pdf") || cleanUrl.includes(".pdf")) {
            resolvedType = "pdf";
          } else if (
            ["JPG", "JPEG", "PNG", "GIF", "WEBP", "BMP", "SVG", "HEIC", "HEIF", "AVIF", "TIFF"].includes(lbl) ||
            cleanUrl.match(/\.(jpeg|jpg|jfif|gif|png|webp|bmp|svg|heic|heif|avif|tiff?)(\?|$)/)
          ) {
            resolvedType = "image";
          } else {
            resolvedType = "image";
          }
          let formatLabel = getAttachmentFormatLabel(file);
          if (resolvedType === "pdf") formatLabel = "PDF";
          else if (resolvedType === "image" && (formatLabel === "FILE" || formatLabel === "OTHER"))
            formatLabel = "IMAGE";

          if (!resolvedUrl && resolvedType === "image") {
            resolvedType = "other";
            logAttachmentPreviewDowngradeToGenericFile(
              "https_branch_labeled_image_but_no_blob_or_native_displayUrl",
              file,
              resolvedUrl,
              resolvedType,
              { localLedgerOnly }
            );
          }

          logFilePreviewForensic("https_url_branch_first_paint", {
            originalFile: file,
            resolvedUrl,
            resolvedType,
            localLedgerOnly,
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
                !localLedgerOnly &&
                !controller.signal.aborted &&
                typeof navigator !== "undefined" &&
                (navigator.onLine || isCapacitorNativeApp())
              ) {
                // Persist run ko component lifecycle se mat baandho; tile unmount ho tab bhi cache fill complete ho.
                probe = await getRemoteAttachmentBlobPreferOfflineCache(file, undefined, {
                  localOnly: localLedgerOnly,
                });
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
        const isStorageObjectPath =
          looksLikeFirebaseStorageObjectPath(file, { companyId: pathCompanyId }) ||
          Boolean(
            resolvedStoragePath &&
              /^voucher-files\//i.test(resolvedStoragePath) &&
              typeof file === "string" &&
              !/^https?:\/\//i.test(file)
          );
        resolvedUrl = isStorageObjectPath || isLocalFileRef(file) ? null : file;
        if (isStorageObjectPath) {
          try {
            // Broken relative path flicker avoid: raw `voucher-files/...` ko pehle offline cache/native ref se resolve karo.
            const nativeCached = usesEmbeddedNativeAttachmentStorage()
              ? await getOfflineCachedAttachmentNativeRef(file)
              : null;
            if (nativeCached?.displayUrl) {
              resolvedUrl = nativeCached.displayUrl;
              const ct = String(nativeCached.contentType || "").toLowerCase();
              if (ct.includes("pdf")) resolvedType = "pdf";
              else if (ct.startsWith("image/")) resolvedType = "image";
            } else {
              // Raw object-path (`voucher-files/...`) ke liye cache miss par SDK fetch + cache write try karo.
              const fetchKey = resolvedStoragePath || file;
              let cachedBlob = await tryOfflineCachedAttachmentBlobMultiKey(fetchKey);
              if ((!cachedBlob || cachedBlob.size === 0) && !controller.signal.aborted && !localLedgerOnly) {
                cachedBlob = await getRemoteAttachmentBlobPreferOfflineCache(fetchKey, controller.signal, {
                  localOnly: localLedgerOnly,
                });
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
        /* `local:` — Native par direct file-path URL; web par putPendingFile blob URL / IDB / Host fetch. */
        if (file.startsWith(LOCAL_FILE_PREFIX)) {
          try {
            // Sync meta (EXE disk OR web IDB putPendingFile displayUrl) — spinner skip.
            const localMetaSync = getLocalFileRefMetaSync(file);
            const localMeta = localMetaSync || (await getLocalFileRefMeta(file));
            let b: Blob | null | undefined = null;
            if (localMeta?.displayUrl) {
              if (localMeta.fileName) {
                try {
                  resolvedName = decodeURIComponent(String(localMeta.fileName));
                } catch {
                  resolvedName = String(localMeta.fileName);
                }
              }
              const hintKind = getAttachmentPreviewKindFromHints(localMeta.fileName, localMeta.contentType);
              if (hintKind === "pdf" || (localMeta.contentType || "").toLowerCase().includes("pdf")) {
                resolvedType = "pdf";
              } else if (hintKind === "image" || (localMeta.contentType || "").toLowerCase().startsWith("image/")) {
                resolvedType = "image";
              }
              resolvedUrl = localMeta.displayUrl;
              localFormatHint = getAttachmentFormatLabelFromHints(localMeta.fileName, localMeta.contentType);
              // Restore ke baad contentType kabhi octet-stream / restored_* name → FILE icon.
              // Bytes sniff karke IMAGE/PDF promote karo (displayUrl pehle se paint ho sake).
              if (resolvedType === "other") {
                try {
                  b = await getBlobFromLocalFileRef(file, {
                    companyId: pathCompanyId ?? voucherAttachmentFb?.companyId,
                  });
                  if (b && b.size > 0) {
                    const kind = await sniffBlobKindForPreview(b);
                    if (kind === "pdf") {
                      resolvedType = "pdf";
                      localFormatHint = "PDF";
                    } else if (kind === "image") {
                      resolvedType = "image";
                      objectUrl = URL.createObjectURL(b);
                      resolvedUrl = objectUrl;
                      rememberHoverBlobUrl(file, objectUrl);
                      localFormatHint =
                        getAttachmentFormatLabelFromHints(localMeta.fileName, b.type || localMeta.contentType) ||
                        "IMAGE";
                    }
                  }
                } catch {
                  /* keep displayUrl + other */
                }
              }
            } else {
              // Offline cache + pending IndexedDB — `local:` ref ko browser preview ke liye blob URL me resolve karo.
              const localResolved = await resolveLocalRefToBlobUrlForPreview(
                file,
                attachmentClientFileUrls,
                pathCompanyId ?? voucherAttachmentFb?.companyId
              );
              b = localResolved.blob;
              const payload = b ? null : await getPendingPayloadForLocalRef(file);
              if (!b && payload?.blob) b = payload.blob;
              localFormatHint =
                getAttachmentFormatLabelFromHints(payload?.fileName, payload?.contentType) ||
                (b ? getAttachmentFormatLabelFromHints(null, b.type || null) : null);
              if (payload?.fileName) {
                try {
                  resolvedName = decodeURIComponent(String(payload.fileName));
                } catch {
                  resolvedName = String(payload.fileName);
                }
              }
              if (b && b.size > 0) {
                const kind = await sniffBlobKindForPreview(b);
                objectUrl = localResolved.blobUrl || URL.createObjectURL(b);
                resolvedUrl = objectUrl;
                rememberHoverBlobUrl(file, objectUrl);
                if (kind === "pdf") {
                  resolvedType = "pdf";
                } else if (kind === "image") {
                  resolvedType = "image";
                }
              } else if (
                localResolved.blobUrl &&
                !isUnresolvedAttachmentPreviewUrl(localResolved.blobUrl)
              ) {
                // Native displayUrl without blob — still paintable.
                resolvedUrl = localResolved.blobUrl;
                rememberHoverBlobUrl(file, localResolved.blobUrl);
                const lbl = getAttachmentFormatLabel(file);
                if (lbl === "PDF") resolvedType = "pdf";
                else resolvedType = "image";
              }
            }
          } catch {
            /* pending missing */
          }
          if (
            isUnresolvedAttachmentPreviewUrl(resolvedUrl) &&
            typeof file === "string" &&
            file.startsWith(LOCAL_FILE_PREFIX) &&
            (pathCompanyId || voucherAttachmentFb?.companyId) &&
            // Offline / local-restore company: Firebase/PL URL try mat karo — bytes disk/pending pe hone chahiye.
            !localLedgerOnly
          ) {
            try {
              const { fetchPlServerAttachmentBlob } = await import("@/lib/plServerAttachmentFetch");
              const cid = String(pathCompanyId || voucherAttachmentFb?.companyId || "").trim();
              const remoteBlob = await fetchPlServerAttachmentBlob(cid, file, controller.signal);
              if (remoteBlob && remoteBlob.size > 0 && !controller.signal.aborted) {
                objectUrl = URL.createObjectURL(remoteBlob);
                rememberHoverBlobUrl(file, objectUrl);
                resolvedUrl = objectUrl;
                const kind = await sniffBlobKindForPreview(remoteBlob);
                if (kind === "pdf") resolvedType = "pdf";
                else if (kind === "image") resolvedType = "image";
              }
            } catch {
              /* pl server attachment early fetch */
            }
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
            const driveCompanyId =
              String(pathCompanyId || voucherAttachmentFb?.companyId || "").trim() || undefined;
            // Offline preload cache → pending `local:` → Drive (turant preview / edit jaisa).
            const b =
              (await getRemoteAttachmentBlobPreferOfflineCache(file, controller.signal, {
                companyId: driveCompanyId,
              })) || (await getBlobFromLocalFileRef(file, { companyId: driveCompanyId }));
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
            ["JPG", "JPEG", "PNG", "GIF", "WEBP", "BMP", "SVG", "HEIC", "HEIF", "AVIF", "TIFF"].includes(lblEarly)
          ) {
            resolvedType = "image";
          } else {
            const cleanUrl = file.split("?")[0].toLowerCase();
            if (cleanUrl.endsWith(".pdf")) {
              resolvedType = "pdf";
            } else if (cleanUrl.match(/\.(jpe?g|jfif|gif|png|webp|bmp|svg|heic|heif|avif|tiff?)(\?|$)/i)) {
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
          isUnresolvedAttachmentPreviewUrl(resolvedUrl) &&
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
              let probe: Blob | null = await tryOfflineCachedAttachmentBlobMultiKey(openUrl);
              const navOn =
                typeof navigator !== "undefined" &&
                (navigator.onLine || isCapacitorNativeApp() || isElectronDesktopApp());
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
                  ["JPG", "JPEG", "PNG", "GIF", "WEBP", "BMP", "SVG", "HEIC", "HEIF", "AVIF", "TIFF"].includes(lbl) ||
                  cleanUrl.match(/\.(jpe?g|jfif|gif|png|webp|bmp|svg|heic|heif|avif|tiff?)(\?|$)/i)
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
        if (
          isUnresolvedAttachmentPreviewUrl(resolvedUrl) &&
          typeof file === "string" &&
          file.startsWith(LOCAL_FILE_PREFIX) &&
          (pathCompanyId || voucherAttachmentFb?.companyId)
        ) {
          try {
            const { fetchPlServerAttachmentBlob } = await import("@/lib/plServerAttachmentFetch");
            const cid = String(pathCompanyId || voucherAttachmentFb?.companyId || "").trim();
            const remoteBlob = await fetchPlServerAttachmentBlob(cid, file, controller.signal);
            if (remoteBlob && remoteBlob.size > 0 && !controller.signal.aborted) {
              objectUrl = URL.createObjectURL(remoteBlob);
              resolvedUrl = objectUrl;
              const kind = await sniffBlobKindForPreview(remoteBlob);
              if (kind === "pdf") resolvedType = "pdf";
              else if (kind === "image") resolvedType = "image";
            }
          } catch {
            /* pl server attachment best-effort */
          }
        }
        // Render safety: URL source null ho to image/pdf force na karo; warna voucher edit me broken thumbnail flicker hota hai.
        if (isUnresolvedAttachmentPreviewUrl(resolvedUrl)) {
          resolvedUrl = null;
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
      const hintedKind = getAttachmentPreviewKindFromHints(
        resolvedName && resolvedName !== "file" ? resolvedName : null,
        localFormatHint === "PDF"
          ? "application/pdf"
          : isImageFormatLabel(localFormatHint)
            ? `image/${String(localFormatHint).toLowerCase().replace("jpg", "jpeg")}`
            : null
      );
      if (hintedKind && resolvedType === "other" && !isUnresolvedAttachmentPreviewUrl(resolvedUrl)) {
        resolvedType = hintedKind;
      }
      if (resolvedType === "pdf") formatLabel = "PDF";
      else if (resolvedType === "image" && (formatLabel === "FILE" || formatLabel === "IMAGE")) {
        formatLabel = localFormatHint || "IMAGE";
      }

      setFileInfo({
        url: resolvedUrl,
        type: resolvedType,
        name:
          resolvedName.startsWith(LOCAL_FILE_PREFIX) || isLocalFileRef(resolvedName)
            ? "Attachment"
            : resolvedName,
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
        const pdfCacheKey = pdfThumbCacheKey(
          fileObject instanceof File ? fileObject : undefined,
          resolvedUrl || "",
          resolvedStoragePath,
          layoutMaxEdge
        );
        const cachedPdfThumb = pdfThumbCacheGet(pdfCacheKey);
        if (cachedPdfThumb) {
          pdfThumbnailKeyRef.current = pdfCacheKey;
          setPdfThumbnailSafe(cachedPdfThumb);
        } else if (pdfThumbnailKeyRef.current === pdfCacheKey && thumbnailUrlRef.current) {
          // Same PDF ka thumb already visible hai; refresh/live-pull pass me icon fallback flash mat dikhao.
        } else {
          setPdfThumbnailSafe(null); // clear previous so loading shows for a different uncached PDF
        }
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
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    };

    processFile();

    // Purana 3s abort = thumbnail kaam karte PDF bhi cut; lamba safety net = sirf asli hang
    const timeoutId = setTimeout(() => controller.abort(), PDF_THUMBNAIL_EFFECT_HARD_ABORT_MS);

    return () => {
      clearTimeout(timeoutId);
      if (pdfThumbDebounceTimer) clearTimeout(pdfThumbDebounceTimer);
      controller.abort();
      // Shared hover LRU me jo blob hai usko revoke mat karo — Edit Party / masters dubara open
      // par revoked `blob:` → broken img + alt=`local:uuid` (open theek, preview toot).
      const revokeLater = objectUrl;
      if (revokeLater) {
        const fileKey =
          typeof normalizedPreviewFile === "string" ? String(normalizedPreviewFile).trim() : "";
        const cached = fileKey ? peekHoverCachedBlobUrl(fileKey) : undefined;
        if (cached !== revokeLater) {
          setTimeout(() => {
            try {
              URL.revokeObjectURL(revokeLater);
            } catch {
              /* ignore */
            }
          }, 0);
        }
      }
      const thumb = thumbnailUrlRef.current;
      if (thumb && !pdfThumbBlobIsCached(thumb)) revokeThumbnailUrl(thumb);
      thumbnailUrlRef.current = null;
      setPdfThumbnail(null);
    };
  }, [
    normalizedPreviewFile,
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
    pathCompanyId,
    attachmentCompanyId,
    fileLoadStatus,
    attachmentMode,
    localLedgerOnly,
    preferLocalAttachmentFirst,
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
  const pointerOpenGuardRef = useRef<{ x: number; y: number; pointerType: string; at: number } | null>(null);
  const skipNextClickOpenRef = useRef(false);

  const openAttachmentFromFileInfo = useCallback(() => {
    const rawRef =
      typeof normalizedPreviewFile === "string"
        ? normalizeAttachmentUrlForDevicePreview(normalizedPreviewFile)
        : "";
    const underlyingLocalRef =
      typeof normalizedPreviewFile === "string" && isLocalFileRef(normalizedPreviewFile)
        ? normalizedPreviewFile
        : "";
    // Click-open: thumbnail `blob:` mat — canonical `local:` / https ref (revoke / CORS false alarm avoid).
    const openSrc =
      underlyingLocalRef ||
      (rawRef && !rawRef.startsWith("blob:") ? rawRef : "") ||
      (viewFileInfo.url && !viewFileInfo.url.startsWith("blob:") ? viewFileInfo.url : "") ||
      rawRef ||
      viewFileInfo.url ||
      "";
    if (!openSrc) return;
    const kind =
      viewFileInfo.formatLabel === "PDF" || viewFileInfo.type === "pdf"
        ? "pdf"
        : viewFileInfo.type === "image" ||
            ["JPG", "JPEG", "PNG", "GIF", "WEBP", "BMP", "SVG", "HEIC", "HEIF", "AVIF", "TIFF"].includes(
              viewFileInfo.formatLabel || ""
            )
          ? "image"
          : "other";
    const g =
      attachmentGallery && attachmentGallery.urls.length > 1
        ? { urls: attachmentGallery.urls, startIndex: attachmentGallery.startIndex }
        : undefined;
    const clientList =
      attachmentClientFileUrls ??
      (attachmentGallery?.urls && attachmentGallery.urls.length > 0 ? [...attachmentGallery.urls] : undefined);
    const cid = String(pathCompanyId || voucherAttachmentFb?.companyId || "").trim();
    const serverFallback =
      cid && (underlyingLocalRef || isLocalFileRef(openSrc) || voucherAttachmentFb?.interCompanyPeer)
        ? {
            companyId: cid,
            voucherId: voucherAttachmentFb?.voucherId ?? "",
            clientFileUrls: clientList,
            interCompanyPeer: voucherAttachmentFb?.interCompanyPeer,
          }
        : undefined;
    void openAttachmentInApp(openSrc, {
      title: viewFileInfo.name,
      kind,
      gallery: g,
      serverFallback,
      localLedgerOnly,
    });
  }, [
    viewFileInfo.url,
    viewFileInfo.type,
    viewFileInfo.name,
    viewFileInfo.formatLabel,
    normalizedPreviewFile,
    attachmentGalleryFingerprint,
    attachmentClientUrlsFingerprint,
    voucherAttachmentFbFingerprint,
    pathCompanyId,
    localLedgerOnly,
    voucherAttachmentFb?.interCompanyPeer,
    voucherAttachmentFb?.companyId,
    voucherAttachmentFb?.voucherId,
  ]);

  const handlePreviewClick = (e: React.MouseEvent) => {
    if (children || (disabled && !allowPreviewWhenDisabled)) return;
    /* Mobile: Copy chip khula ho to short tap se file open na ho — sirf Copy dabayein */
    if (tapInteractionMode && mobileCopyRevealed) return;
    e.preventDefault();
    e.stopPropagation();
    pointerOpenGuardRef.current = null;
    if (skipNextClickOpenRef.current) {
      skipNextClickOpenRef.current = false;
      return;
    }
    openAttachmentFromFileInfo();
  };

  const handlePreviewPointerDown = (e: React.PointerEvent) => {
    if (children || (disabled && !allowPreviewWhenDisabled)) return;
    if (e.button !== 0) return;
    pointerOpenGuardRef.current = {
      x: e.clientX,
      y: e.clientY,
      pointerType: e.pointerType,
      at: Date.now(),
    };
  };

  const handlePreviewPointerUp = (e: React.PointerEvent) => {
    if (children || (disabled && !allowPreviewWhenDisabled)) return;
    if (tapInteractionMode && mobileCopyRevealed) return;
    const start = pointerOpenGuardRef.current;
    pointerOpenGuardRef.current = null;
    if (!start || start.pointerType !== e.pointerType) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (dx * dx + dy * dy > 12 * 12) return;
    if (Date.now() - start.at > 700) return;
    e.preventDefault();
    e.stopPropagation();
    skipNextClickOpenRef.current = true;
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
    if (
      !previewTimedOut &&
      (viewIsLoading || (viewFileInfo.type === "pdf" && isPdfLoading && !pdfThumbnail))
    ) {
      return <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />;
    }

    if (previewTimedOut && !viewFileInfo.url && !pdfThumbnail) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-0.5 bg-muted/40 p-1 text-center">
          <FileText className="h-5 w-5 text-muted-foreground" aria-hidden />
          <span className="text-[9px] font-semibold leading-tight text-muted-foreground">
            {viewFileInfo.formatLabel || "FILE"}
          </span>
        </div>
      );
    }
    
    switch (viewFileInfo.type) {
      case "image":
        if (isUnresolvedAttachmentPreviewUrl(viewFileInfo.url)) {
          return children || (
            <div className="flex h-full w-full flex-col items-center justify-center bg-slate-50 text-slate-500">
              <FileText className="h-8 w-8" />
              <span className="mt-1 text-xs font-bold uppercase">File</span>
            </div>
          );
        }
        return (
          children ||
          (isBlobOrDataDisplayUrl(viewFileInfo.url) ? (
            // eslint-disable-next-line @next/next/no-img-element -- blob:/data: Next Image se `ERR_FILE_NOT_FOUND` race
            <img
              src={viewFileInfo.url!}
              alt={viewFileInfo.name?.startsWith(LOCAL_FILE_PREFIX) ? "Attachment" : viewFileInfo.name}
              className={cn(
                "absolute inset-0 h-full w-full",
                objectFit === "contain" ? "object-contain" : "object-cover"
              )}
              onError={() => {
                const bad = viewFileInfo.url;
                if (typeof normalizedPreviewFile === "string" && bad) {
                  forgetHoverBlobUrl(normalizedPreviewFile, bad);
                }
                setFileInfo((prev) =>
                  prev.url === bad ? { ...prev, url: null, type: "other" } : prev
                );
                setIsLoading(true);
              }}
            />
          ) : (
            <Image
              src={viewFileInfo.url!}
              alt={viewFileInfo.name?.startsWith(LOCAL_FILE_PREFIX) ? "Attachment" : viewFileInfo.name}
              fill
              sizes={`${layoutMaxEdge}px`}
              className={objectFit === "contain" ? "object-contain" : "object-cover"}
              unoptimized
              onError={() => {
                const bad = viewFileInfo.url;
                if (typeof normalizedPreviewFile === "string" && bad) {
                  forgetHoverBlobUrl(normalizedPreviewFile, bad);
                }
                setFileInfo((prev) =>
                  prev.url === bad ? { ...prev, url: null, type: "other" } : prev
                );
                setIsLoading(true);
              }}
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
        onPointerDown: (e: React.PointerEvent) => {
          handlePreviewPointerDown(e);
          copyAttachmentHold.onPointerDown(e);
        },
        onPointerMove: copyAttachmentHold.onPointerMove,
        onPointerUp: (e: React.PointerEvent) => {
          copyAttachmentHold.onPointerUp();
          handlePreviewPointerUp(e);
        },
        onPointerCancel: copyAttachmentHold.onPointerCancel,
        onPointerLeave: copyAttachmentHold.onPointerLeave,
        onClickCapture: copyAttachmentHold.onClickCapture,
        onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
      }
    : {
        onPointerDown: handlePreviewPointerDown,
        onPointerUp: handlePreviewPointerUp,
      };

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
          onClick={() =>
            void openAttachmentInApp(viewFileInfo.url!, {
              title: viewFileInfo.name,
              kind: "pdf",
              localLedgerOnly,
            })
          }
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

  if (attachmentBlockedByCrossCompanyPolicy) {
    return (
      <div
        className={cn(
          "relative flex flex-col items-center justify-center rounded-md border border-dashed border-muted-foreground/40 bg-muted/30 p-2 text-center",
          className
        )}
        style={{ width: previewBox?.width ?? size, height: previewBox?.height ?? size }}
        title="Attachment belongs to another company that is not on your account"
      >
        <FileText className="mb-1 h-6 w-6 text-muted-foreground" />
        <p className="text-[10px] leading-tight text-muted-foreground">
          Other company file
          <br />
          (not available here)
        </p>
        {onRemove && !disabled ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-0.5 top-0.5 h-6 w-6 text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        ) : null}
      </div>
    );
  }

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
