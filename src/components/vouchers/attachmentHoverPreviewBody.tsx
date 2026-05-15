"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilePreview } from "@/components/vouchers/FilePreview";
import { openAttachmentInApp } from "@/lib/openAttachmentInApp";
import { tryGetStoragePathFromFirebaseDownloadUrl, looksLikeFirebaseStorageObjectPath } from "@/lib/firebaseStorageDownloadUrl";
import {
  isLocalFileRef,
  getBlobFromLocalFileRef,
  getLocalFileRefMeta,
  getLocalFileRefMetaSync,
} from "@/lib/localPendingFiles";
import { useVoucherAttachmentFallback } from "@/contexts/VoucherAttachmentFallbackContext";
import { getAttachmentFormatLabel, sniffBlobKindForPreview } from "@/lib/attachmentFormatLabel";
import { getRemoteAttachmentBlobPreferOfflineCache } from "@/lib/offlineAttachmentUrlCache";
import { isElectronDesktopApp } from "@/lib/isElectronDesktop";
import { trimEntityFileUrlForPreview } from "@/lib/trimEntityFileUrlForPreview";
import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";

/** Dubara hover par turant — blob URL session `Map` (static/APK me repeat IndexedDB + decode kam) */
const HOVER_HTTPS_UI_CACHE_MAX = 80;
const hoverHttpsBlobUrlByKey = new Map<string, string>();
const hoverHttpsBlobUrlLru: string[] = [];

function peekHoverCachedBlobUrl(urlKey: string): string | undefined {
  const k = urlKey.trim();
  const ou = hoverHttpsBlobUrlByKey.get(k);
  if (!ou) return undefined;
  const i = hoverHttpsBlobUrlLru.indexOf(k);
  if (i >= 0) {
    hoverHttpsBlobUrlLru.splice(i, 1);
    hoverHttpsBlobUrlLru.push(k);
  }
  return ou;
}

function rememberHoverBlobUrl(urlKey: string, objectUrl: string): void {
  const k = urlKey.trim();
  const existing = hoverHttpsBlobUrlByKey.get(k);
  if (existing && existing !== objectUrl) {
    try {
      URL.revokeObjectURL(existing);
    } catch {
      /* ignore */
    }
  }
  hoverHttpsBlobUrlByKey.set(k, objectUrl);
  const idx = hoverHttpsBlobUrlLru.indexOf(k);
  if (idx >= 0) hoverHttpsBlobUrlLru.splice(idx, 1);
  hoverHttpsBlobUrlLru.push(k);
  while (hoverHttpsBlobUrlLru.length > HOVER_HTTPS_UI_CACHE_MAX) {
    const drop = hoverHttpsBlobUrlLru.shift();
    if (!drop) break;
    const ou = hoverHttpsBlobUrlByKey.get(drop);
    hoverHttpsBlobUrlByKey.delete(drop);
    if (ou) {
      try {
        URL.revokeObjectURL(ou);
      } catch {
        /* ignore */
      }
    }
  }
}

export async function prewarmHoverPreviewHttpsUrls(
  urls: readonly string[],
  options?: { signal?: AbortSignal; maxUrls?: number }
): Promise<void> {
  // Idle path: visible rows ke liye LRU + `getRemoteAttachmentBlobPreferOfflineCache` — hover turant; app-start par global preload nahi.
  // Poori company bytes background: `CompanyAttachmentOfflineBackfillManager` / `runEmbeddedAttachmentPrefetchPhase` + ab wahan `prioritizeUrls` bhi.
  // HTTPS signed URLs + raw Storage object-path — offline avatar / hover dono IndexedDB se hit.
  const maxUrls = Math.max(1, Math.min(400, options?.maxUrls ?? 200));
  const unique = [...new Set(urls.map((u) => String(u || "").trim()).filter((u) => {
    // Transaction table visible rows: HTTPS + raw Storage path dono warm — gallery / avatar hover offline hit.
    return /^https?:\/\//i.test(u) || looksLikeFirebaseStorageObjectPath(u);
  }))].slice(0, maxUrls);
  for (const url of unique) {
    if (options?.signal?.aborted) break;
    if (peekHoverCachedBlobUrl(url)) continue;
    try {
      const blob = await getRemoteAttachmentBlobPreferOfflineCache(url, options?.signal);
      if (!blob || blob.size === 0) continue;
      const objectUrl = URL.createObjectURL(blob);
      rememberHoverBlobUrl(url, objectUrl);
    } catch {
      // Visible-list warm is best-effort; hover open path will still fetch on demand if needed.
    }
  }
}

/**
 * Hover portal ke andar HTTPS image: IndexedDB/offline warmup pehle = EXE spinner lamba (web browser direct img tez).
 * Electron + online → seedha `src=https` (`web` flow); blob background me LRU me bharo taaki dubara/offline hover tez ho.
 */
function HoverPreviewHttpsAwareImage(props: {
  url: string;
  alt?: string;
  className?: string;
  loading?: React.ImgHTMLAttributes<HTMLImageElement>["loading"];
  onDoubleClick?: React.MouseEventHandler<HTMLImageElement>;
}) {
  const u = String(props.url || "");
  const [displaySrc, setDisplaySrc] = React.useState<string>(() => {
    if (!/^https?:\/\//i.test(u)) {
      if (u.startsWith("blob:") || u.startsWith("data:")) return u;
      const fromLru = peekHoverCachedBlobUrl(u);
      if (fromLru) return fromLru;
      return "";
    }
    const fromLru = peekHoverCachedBlobUrl(u);
    if (fromLru) return fromLru;
    if (typeof navigator !== "undefined" && navigator.onLine && isElectronDesktopApp()) return u;
    return "";
  });

  React.useEffect(() => {
    let cancelled = false;
    /** Sirf is effect ka naya blob — cache miss par banega; cache hit par revoke zaroori nahi */
    let blobUrlToRevoke: string | null = null;

    if (!/^https?:\/\//i.test(u)) {
      // `blob:` / `data:` — direct render; Storage object-path / baaki — cache/SDK se blob (raw path `<img src>` invalid).
      if (u.startsWith("blob:") || u.startsWith("data:")) {
        setDisplaySrc(u);
        return () => {
          cancelled = true;
        };
      }
      setDisplaySrc("");
      void (async () => {
        const b = await getRemoteAttachmentBlobPreferOfflineCache(u);
        if (cancelled) return;
        if (b && b.size > 0) {
          const ou = URL.createObjectURL(b);
          if (cancelled) {
            URL.revokeObjectURL(ou);
            return;
          }
          rememberHoverBlobUrl(u, ou);
          blobUrlToRevoke = ou;
          setDisplaySrc(ou);
          return;
        }
      })();
      return () => {
        cancelled = true;
        if (blobUrlToRevoke && hoverHttpsBlobUrlByKey.get(u.trim()) !== blobUrlToRevoke) {
          try {
            URL.revokeObjectURL(blobUrlToRevoke);
          } catch {
            /* ignore */
          }
        }
      };
    }

    const cached = peekHoverCachedBlobUrl(u);
    if (cached) {
      setDisplaySrc(cached);
      return () => {
        cancelled = true;
      };
    }

    // Electron EXE online: web jaisi direct Firebase HTTPS — IndexedDB prefetch baad spinner nahi chipkata
    const electronServeRemoteFirst =
      typeof navigator !== "undefined" && navigator.onLine && isElectronDesktopApp();
    if (electronServeRemoteFirst) {
      setDisplaySrc(u);
      void (async () => {
        const b = await getRemoteAttachmentBlobPreferOfflineCache(u);
        if (cancelled || !b || b.size === 0) return;
        try {
          const ou = URL.createObjectURL(b);
          if (cancelled) {
            URL.revokeObjectURL(ou);
            return;
          }
          rememberHoverBlobUrl(u, ou);
          // IMG ab HTTPS use kar chuka — optionally blob par switch mat karo (flicker avoid); LRU offline ke liye
        } catch {
          /* ignore */
        }
      })();
      return () => {
        cancelled = true;
      };
    }

    setDisplaySrc("");
    void (async () => {
      const b = await getRemoteAttachmentBlobPreferOfflineCache(u);
      if (cancelled) return;
      if (b && b.size > 0) {
        const ou = URL.createObjectURL(b);
        if (cancelled) {
          URL.revokeObjectURL(ou);
          return;
        }
        rememberHoverBlobUrl(u, ou);
        blobUrlToRevoke = ou;
        setDisplaySrc(ou);
      } else if (!cancelled) {
        setDisplaySrc(u);
      }
    })();

    return () => {
      cancelled = true;
      if (blobUrlToRevoke && hoverHttpsBlobUrlByKey.get(u.trim()) !== blobUrlToRevoke) {
        try {
          URL.revokeObjectURL(blobUrlToRevoke);
        } catch {
          /* ignore */
        }
      }
    };
  }, [u]);

  if (!displaySrc) {
    return (
      <div className="flex min-h-[200px] min-w-[220px] items-center justify-center p-6">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-label="Loading preview" />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- blob: / path / remote fallback
    <img
      src={displaySrc}
      alt={props.alt ?? ""}
      draggable={false}
      className={props.className}
      loading={props.loading}
      onDoubleClick={props.onDoubleClick}
    />
  );
}

/** Multi-file row / local pending: gallery swipe App me */
export type AttachmentPreviewGalleryOpts = { urls: readonly string[]; startIndex: number };

/** `local:uuid` — IndexedDB blob se object URL; voucher table + avatar hover same preview */
export function LocalFileRefTooltipPreview({
  url,
  gallery,
}: {
  url: string;
  gallery?: AttachmentPreviewGalleryOpts;
}) {
  const voucherAttachmentFb = useVoucherAttachmentFallback();
  const [state, setState] = React.useState<
    { status: "loading" } | { status: "error" } | { status: "ready"; objectUrl: string; mime: string }
  >({ status: "loading" });

  React.useEffect(() => {
    let cancelled = false;
    const urlRef = { current: null as string | null };
    void (async () => {
      try {
        if (isCapacitorNativeApp()) {
          // Native fast-path: preview ke liye JS blob read mat karo; direct `convertFileSrc` display URL hi use karo.
          const meta = getLocalFileRefMetaSync(url) ?? (await getLocalFileRefMeta(url));
          if (cancelled) return;
          if (!meta?.displayUrl) {
            setState({ status: "error" });
            return;
          }
          const mime = String(meta.contentType || "application/octet-stream").toLowerCase();
          setState({ status: "ready", objectUrl: meta.displayUrl, mime });
          return;
        }
        const blob = await getBlobFromLocalFileRef(url, {
          allowNativeRead: false,
          context: "LocalFileRefTooltipPreview",
        });
        if (cancelled) return;
        if (!blob || blob.size === 0) {
          setState({ status: "error" });
          return;
        }
        let mime = String(blob.type || "application/octet-stream").toLowerCase();
        if (mime === "application/octet-stream" || !blob.type) {
          const kind = await sniffBlobKindForPreview(blob);
          if (kind === "pdf") mime = "application/pdf";
          else if (kind === "image") mime = "image/jpeg";
        }
        const objectUrl = URL.createObjectURL(blob);
        urlRef.current = objectUrl;
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          urlRef.current = null;
          return;
        }
        setState({ status: "ready", objectUrl, mime });
      } catch {
        if (!cancelled) setState({ status: "error" });
      }
    })();
    return () => {
      cancelled = true;
      if (urlRef.current && !isCapacitorNativeApp()) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
    };
  }, [url]);

  const openAttachment = React.useCallback(() => {
    const kind: "pdf" | "image" | "other" =
      state.status === "ready" && state.mime.startsWith("image/")
        ? "image"
        : state.status === "ready" && (state.mime === "application/pdf" || state.mime.includes("pdf"))
          ? "pdf"
          : "other";
    const multi =
      gallery && gallery.urls.length > 1 ? { urls: gallery.urls, startIndex: gallery.startIndex } : undefined;
    const serverFallback =
      voucherAttachmentFb && isLocalFileRef(url)
        ? {
            companyId: voucherAttachmentFb.companyId,
            voucherId: voucherAttachmentFb.voucherId,
            clientFileUrls: gallery?.urls,
          }
        : undefined;
    void openAttachmentInApp(url, { kind, gallery: multi, serverFallback });
  }, [url, state, gallery, voucherAttachmentFb]);

  if (state.status === "loading") {
    return (
      <div className="flex min-h-[200px] min-w-[220px] items-center justify-center p-6">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-label="Loading preview" />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex flex-col items-center gap-2 p-6 text-center text-sm text-muted-foreground">
        <span>File stored on this device</span>
        <Button type="button" size="sm" variant="secondary" onClick={openAttachment}>
          Open
        </Button>
      </div>
    );
  }

  const { objectUrl, mime } = state;
  const isImage = mime.startsWith("image/");
  const isPdf = mime === "application/pdf" || mime.includes("pdf");

  /** Voucher FilePreview hover jaisa — max-w-full / center flex mat (AttachmentHoverPortal width-fit + scroll) */
  return (
    <div className="flex w-max max-w-none flex-shrink-0 flex-col gap-1">
      {isImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- blob: preview
        <img
          src={objectUrl}
          alt=""
          draggable={false}
          className="block h-auto w-auto max-h-none max-w-none object-contain"
          loading="eager"
          /* Single-click = portal scroll/drag; double-click = open (browser / app) */
          onDoubleClick={(e) => {
            e.stopPropagation();
            openAttachment();
          }}
        />
      ) : isPdf ? (
        /* Nested FilePreview ke img par dblclick nahi — React bubble tr.onDoubleClick tak; yahan stop + open */
        <div
          className="overflow-hidden rounded-lg border bg-background"
          onDoubleClick={(e) => {
            e.stopPropagation();
            openAttachment();
          }}
        >
          <FilePreview
            file={objectUrl}
            size={800}
            disabled={false}
            objectFit="contain"
            enableHoverFullPreview={false}
            showFormatBadge={false}
            holdAttachmentClipboard={false}
          />
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 p-6 text-center text-sm text-muted-foreground">
          <span>Preview not available for this type</span>
          <Button type="button" size="sm" variant="secondary" onClick={openAttachment}>
            Open
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Ek URL ke liye voucher File column / opening balance jaisa hover body —
 * party-bank stripes list+details avatar hover bhi yahi layout use karta hai.
 */
export function SingleAttachmentHoverPreviewBody({
  url,
  gallery,
}: {
  url: string;
  gallery?: AttachmentPreviewGalleryOpts;
}) {
  const normalized = trimEntityFileUrlForPreview(url);
  if (!normalized) {
    return (
      <div className="flex min-h-[120px] min-w-[200px] flex-col items-center justify-center gap-1 p-6 text-center text-sm text-muted-foreground">
        <span>No preview</span>
        <span className="text-xs opacity-80">No file attached</span>
      </div>
    );
  }
  const u = String(normalized);
  const cleanUrl = u.split("?")[0].toLowerCase();
  const isLocalPending = isLocalFileRef(u);
  const storagePathRaw = !isLocalPending ? tryGetStoragePathFromFirebaseDownloadUrl(u) : null;
  const pathLower = (storagePathRaw || "").toLowerCase();
  const fmt = getAttachmentFormatLabel(u);
  const isImage =
    !isLocalPending &&
    (["JPG", "JPEG", "PNG", "GIF", "WEBP", "BMP", "SVG", "HEIC", "HEIF"].includes(fmt) ||
      u.startsWith("data:image/") ||
      /\.(jpe?g|png|gif|webp|bmp|svg)(\?|$)/i.test(cleanUrl));
  const isPdf =
    !isLocalPending &&
    (fmt === "PDF" ||
      u.startsWith("data:application/pdf") ||
      cleanUrl.endsWith(".pdf") ||
      u.toLowerCase().includes(".pdf") ||
      pathLower.includes(".pdf"));
  const galleryOpts = gallery;
  const openAtt = () =>
    void openAttachmentInApp(u, {
      kind: isImage ? "image" : isPdf ? "pdf" : "other",
      gallery:
        galleryOpts && galleryOpts.urls.length > 1
          ? { urls: galleryOpts.urls, startIndex: galleryOpts.startIndex }
          : undefined,
    });
  const storagePath = storagePathRaw ?? undefined;
  const caption = isPdf ? "PDF" : fmt;
  const attachmentGallery =
    galleryOpts && galleryOpts.urls.length > 1
      ? { urls: [...galleryOpts.urls], startIndex: galleryOpts.startIndex }
      : undefined;

  /** Bahar AttachmentHoverPortal — yahi markup FilePreview hoverPanel ke image branch jaisa (taaki zoom/width sahi) */
  return (
    <div className="flex w-max max-w-none flex-col gap-1">
      {isLocalPending ? (
        <LocalFileRefTooltipPreview url={u} gallery={galleryOpts} />
      ) : isImage ? (
        <HoverPreviewHttpsAwareImage
          url={u}
          alt=""
          className="block h-auto w-auto max-h-none max-w-none object-contain"
          loading="eager"
          onDoubleClick={(e) => {
            e.stopPropagation();
            openAtt();
          }}
        />
      ) : (
        <div
          className="overflow-hidden rounded-lg border bg-background"
          onDoubleClick={(e) => {
            e.stopPropagation();
            openAtt();
          }}
        >
          <FilePreview
            file={u}
            storagePath={storagePath}
            size={800}
            disabled={false}
            objectFit="contain"
            enableHoverFullPreview={false}
            showFormatBadge={false}
            attachmentGallery={attachmentGallery}
            holdAttachmentClipboard={false}
          />
        </div>
      )}
      <p className="text-center text-[10px] font-semibold text-muted-foreground">{caption}</p>
    </div>
  );
}
