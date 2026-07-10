"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilePreview } from "@/components/vouchers/FilePreview";
import { openAttachmentInApp } from "@/lib/openAttachmentInApp";
import { tryGetStoragePathFromFirebaseDownloadUrl, looksLikeFirebaseStorageObjectPath } from "@/lib/firebaseStorageDownloadUrl";
import {
  isLocalFileRef,
  getLocalFileRefMeta,
  getLocalFileRefMetaSync,
} from "@/lib/localPendingFiles";
import { useVoucherAttachmentFallback } from "@/contexts/VoucherAttachmentFallbackContext";
import { getAttachmentFormatLabel, sniffBlobKindForPreview } from "@/lib/attachmentFormatLabel";
import { getRemoteAttachmentBlobPreferOfflineCache } from "@/lib/offlineAttachmentUrlCache";
import {
  embeddedAttachmentDisplayUsesLocalBytesOnly,
  usesEmbeddedNativeAttachmentStorage,
} from "@/lib/usesEmbeddedNativeAttachmentStorage";
import { trimEntityFileUrlForPreview } from "@/lib/trimEntityFileUrlForPreview";
import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";
import { normalizeAttachmentUrlForDevicePreview } from "@/lib/attachmentHoldClipboard";
import { forgetHoverBlobUrl, peekHoverCachedBlobUrl, rememberHoverBlobUrl } from "@/lib/attachmentHoverBlobCache";
import { isDriveFileRef } from "@/lib/legacyDriveFileRef";
import { useCompany } from "@/hooks/useCompany";
import { canFetchPlServerAttachmentForCompany } from "@/lib/plServerAttachmentFetch";
import { requestAttachmentUiRefresh } from "@/lib/attachmentLoadReady";
import {
  companyAttachmentMode,
  companyRequiresLocalAttachmentUrlsOnly,
  resolveStaticAttachmentDisplay,
} from "@/lib/staticAttachmentDisplayUrl";
import type { CompanyAttachmentMode } from "@/lib/companyAttachmentStrategies/types";
import { useAttachmentPreviewGallery } from "@/components/vouchers/attachmentPreviewGalleryContext";

export async function prewarmHoverPreviewHttpsUrls(
  urls: readonly string[],
  options?: { signal?: AbortSignal; maxUrls?: number; companyId?: string }
): Promise<void> {
  // Idle path: visible rows ke liye LRU + `getRemoteAttachmentBlobPreferOfflineCache` — hover turant; app-start par global preload nahi.
  // Poori company bytes background: `CompanyAttachmentOfflineBackfillManager` / `runEmbeddedAttachmentPrefetchPhase` + ab wahan `prioritizeUrls` bhi.
  // HTTPS signed URLs + raw Storage object-path + `local:`/`drive:` device refs — offline avatar / hover dono IndexedDB se hit.
  const maxUrls = Math.max(1, Math.min(400, options?.maxUrls ?? 200));
  const { readActiveAttachmentCompanyId } = await import("@/lib/firestorePermissionSuppress");
  const companyId = options?.companyId ?? readActiveAttachmentCompanyId() ?? undefined;
  const unique = [...new Set(urls.map((u) => String(u || "").trim()).filter((u) => {
    // Transaction table visible rows: HTTPS + raw Storage path + Drive/local refs warm.
    return (
      /^https?:\/\//i.test(u) ||
      looksLikeFirebaseStorageObjectPath(u) ||
      isLocalFileRef(u) ||
      isDriveFileRef(u)
    );
  }))].slice(0, maxUrls);
  const { markAttachmentUrlReady } = await import("@/lib/attachmentLoadReady");
  for (const url of unique) {
    if (options?.signal?.aborted) break;
    if (peekHoverCachedBlobUrl(url)) {
      markAttachmentUrlReady(url);
      continue;
    }
    try {
      let blob: Blob | null = null;
      if (isLocalFileRef(url) && companyId) {
        const { resolvePlServerStaffAttachmentPreviewBlob } = await import("@/lib/plServerAttachmentFetch");
        blob = await resolvePlServerStaffAttachmentPreviewBlob(url, {
          companyId,
          signal: options?.signal,
        });
      }
      if (!blob?.size) {
        blob = await getRemoteAttachmentBlobPreferOfflineCache(url, options?.signal, { companyId });
      }
      if (!blob || blob.size === 0) continue;
      const kind = await sniffBlobKindForPreview(blob);
      const mime =
        kind === "pdf"
          ? "application/pdf"
          : kind === "image"
            ? blob.type?.startsWith("image/")
              ? blob.type
              : "image/jpeg"
            : blob.type || "application/octet-stream";
      const typed =
        blob.type === mime || (kind === "image" && blob.type?.startsWith("image/"))
          ? blob
          : new Blob([await blob.arrayBuffer()], { type: mime });
      const objectUrl = URL.createObjectURL(typed);
      rememberHoverBlobUrl(url, objectUrl);
      markAttachmentUrlReady(url);
    } catch {
      // Visible-list warm is best-effort; hover open path will still fetch on demand if needed.
    }
  }
}

export async function prewarmVisibleAttachmentRefsForInstantOpen(
  urls: readonly string[],
  options?: { signal?: AbortSignal; maxUrls?: number; companyId?: string }
): Promise<void> {
  // Instant-open behavior: visible rows ke attachments ko same prewarm pipeline se pehle hydrate karo.
  await prewarmHoverPreviewHttpsUrls(urls, options);
}

/** EXE preview: download + disk write — isse zyada mat wait karo; retry dikhao. */
const EMBEDDED_PREVIEW_DOWNLOAD_TIMEOUT_MS = 28_000;

/** EXE/APK: pl-attachments / blob cache; web: online par HTTPS allowed. */
function HoverPreviewHttpsAwareImage(props: {
  url: string;
  alt?: string;
  className?: string;
  loading?: React.ImgHTMLAttributes<HTMLImageElement>["loading"];
  onDoubleClick?: React.MouseEventHandler<HTMLImageElement>;
  localLedgerOnly?: boolean;
  companyId?: string;
  companyMode?: CompanyAttachmentMode;
}) {
  const u = String(props.url || "");
  const localBytesOnly = props.localLedgerOnly === true || embeddedAttachmentDisplayUsesLocalBytesOnly();
  const [displaySrc, setDisplaySrc] = React.useState<string>(() => {
    if (!/^https?:\/\//i.test(u)) {
      if (u.startsWith("blob:") || u.startsWith("data:")) return u;
      const fromLru = peekHoverCachedBlobUrl(u);
      if (fromLru) return fromLru;
      return "";
    }
    const fromLru = peekHoverCachedBlobUrl(u);
    if (fromLru) return fromLru;
    if (typeof navigator !== "undefined" && navigator.onLine) {
      return u;
    }
    return "";
  });
  const [loadFailed, setLoadFailed] = React.useState(false);
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    setReloadKey(0);
  }, [u]);

  React.useEffect(() => {
    let cancelled = false;
    let blobUrlToRevoke: string | null = null;
    setLoadFailed(false);
    const ac = new AbortController();
    const timeoutId =
      localBytesOnly && typeof window !== "undefined"
        ? window.setTimeout(() => ac.abort(), EMBEDDED_PREVIEW_DOWNLOAD_TIMEOUT_MS)
        : undefined;

    const applyResolved = (displayUrl: string | null, blob: Blob | null) => {
      if (cancelled) return;
      if (displayUrl) {
        setLoadFailed(false);
        setDisplaySrc(displayUrl);
        return;
      }
      if (blob && blob.size > 0) {
        const ou = URL.createObjectURL(blob);
        rememberHoverBlobUrl(u, ou);
        blobUrlToRevoke = ou;
        setLoadFailed(false);
        setDisplaySrc(ou);
        return;
      }
      if (!localBytesOnly && typeof navigator !== "undefined" && navigator.onLine && /^https?:\/\//i.test(u)) {
        setLoadFailed(false);
        setDisplaySrc(u);
      } else {
        setDisplaySrc("");
        setLoadFailed(true);
      }
    };

    if (!/^https?:\/\//i.test(u)) {
      if (u.startsWith("blob:") || u.startsWith("data:")) {
        setDisplaySrc(u);
        return () => {
          cancelled = true;
        };
      }
      setDisplaySrc("");
      void resolveStaticAttachmentDisplay(u, {
        localLedgerOnly: localBytesOnly,
        companyMode: props.companyMode,
        signal: ac.signal,
        companyId: props.companyId,
      })
        .then((resolved) => {
          applyResolved(resolved.displayUrl, resolved.blob);
        })
        .catch(() => {
          applyResolved(null, null);
        });
      return () => {
        cancelled = true;
        if (timeoutId !== undefined) window.clearTimeout(timeoutId);
        ac.abort();
        if (blobUrlToRevoke && peekHoverCachedBlobUrl(u) !== blobUrlToRevoke) {
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
        if (timeoutId !== undefined) window.clearTimeout(timeoutId);
        ac.abort();
      };
    }

    const isHttps = /^https?:\/\//i.test(u);
    const online = typeof navigator !== "undefined" && navigator.onLine;
    const canInstantHttps = isHttps && online && !localBytesOnly;

    // Online HTTPS: initial state already `u` — mat clear karo (warna 2–4s spinner).
    if (!canInstantHttps) {
      setDisplaySrc("");
    } else {
      setDisplaySrc((prev) => prev || u);
    }

    void resolveStaticAttachmentDisplay(u, {
      localLedgerOnly: localBytesOnly,
      companyMode: props.companyMode,
      signal: ac.signal,
    })
      .then((resolved) => {
        if (cancelled) return;
        if (canInstantHttps) {
          if (resolved.blob && resolved.blob.size > 0) {
            applyResolved(resolved.displayUrl, resolved.blob);
            return;
          }
          if (resolved.displayUrl && resolved.displayUrl !== u) {
            applyResolved(resolved.displayUrl, resolved.blob);
          }
          return;
        }
        applyResolved(resolved.displayUrl, resolved.blob);
      })
      .catch(() => {
        if (!canInstantHttps) applyResolved(null, null);
      });

    return () => {
      cancelled = true;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      ac.abort();
      if (blobUrlToRevoke && peekHoverCachedBlobUrl(u) !== blobUrlToRevoke) {
        try {
          URL.revokeObjectURL(blobUrlToRevoke);
        } catch {
          /* ignore */
        }
      }
    };
  }, [u, localBytesOnly, props.companyId, props.companyMode, reloadKey]);

  if (!displaySrc) {
    if (loadFailed) {
      return (
        <div className="flex min-h-[200px] min-w-[220px] flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
          <span>File not on device yet</span>
          <span className="text-xs opacity-80">
            {typeof navigator !== "undefined" && !navigator.onLine
              ? "Connect once online to download, or wait for background sync."
              : "Download timed out or failed — retry or wait for background sync."}
          </span>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => {
              setLoadFailed(false);
              setDisplaySrc("");
              void resolveStaticAttachmentDisplay(u, {
                localLedgerOnly: localBytesOnly,
                companyMode: props.companyMode,
                companyId: props.companyId,
              }).then((resolved) => {
                if (resolved.displayUrl) setDisplaySrc(resolved.displayUrl);
                else if (resolved.blob && resolved.blob.size > 0) {
                  const ou = URL.createObjectURL(resolved.blob);
                  rememberHoverBlobUrl(u, ou);
                  setDisplaySrc(ou);
                } else setLoadFailed(true);
              });
            }}
          >
            Retry download
          </Button>
        </div>
      );
    }
    return (
      <div className="flex min-h-[200px] min-w-[220px] flex-col items-center justify-center gap-2 p-6">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-label="Loading preview" />
        {localBytesOnly ? (
          <span className="text-xs text-muted-foreground">Downloading to device…</span>
        ) : null}
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
      onError={() => {
        forgetHoverBlobUrl(u, displaySrc);
        if (reloadKey >= 2) {
          setDisplaySrc("");
          setLoadFailed(true);
          return;
        }
        setLoadFailed(false);
        setDisplaySrc("");
        setReloadKey((n) => n + 1);
        requestAttachmentUiRefresh();
      }}
    />
  );
}

/** Multi-file row / local pending: gallery swipe App me */
export type AttachmentPreviewGalleryOpts = { urls: readonly string[]; startIndex: number };

/** Portal me nested FilePreview (blob:) PDF ko "FILE" icon dikha deta tha — seedha first-page raster. */
function LocalPdfBlobHoverPreview({
  sourceUrl,
  blob,
  onOpen,
}: {
  sourceUrl: string;
  blob?: Blob | null;
  onOpen: () => void;
}) {
  const [thumbUrl, setThumbUrl] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    let created: string | null = null;
    void (async () => {
      try {
        setLoading(true);
        let pdfBlob = blob && blob.size > 0 ? blob : null;
        if (!pdfBlob) {
          pdfBlob = await fetch(sourceUrl).then((r) => r.blob());
        }
        if (!pdfBlob?.size) throw new Error("empty_pdf");
        const kind = await sniffBlobKindForPreview(pdfBlob);
        if (kind !== "pdf") throw new Error("not_pdf");
        if (pdfBlob.type !== "application/pdf") {
          pdfBlob = new Blob([await pdfBlob.arrayBuffer()], { type: "application/pdf" });
        }
        const { convertPdfFirstPageToImage } = await import("@/lib/pdfToImage");
        const result = await convertPdfFirstPageToImage(pdfBlob, 0.85, 800);
        if (cancelled) {
          URL.revokeObjectURL(result.thumbnailUrl);
          return;
        }
        created = result.thumbnailUrl;
        setThumbUrl(result.thumbnailUrl);
      } catch {
        if (!cancelled) setThumbUrl(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (created) {
        try {
          URL.revokeObjectURL(created);
        } catch {
          /* ignore */
        }
      }
    };
  }, [sourceUrl, blob]);

  if (loading) {
    return (
      <div className="flex min-h-[280px] min-w-[220px] items-center justify-center p-6">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-label="Loading PDF preview" />
      </div>
    );
  }
  if (!thumbUrl) {
    return (
      <div className="flex flex-col items-center gap-2 p-6 text-center text-sm text-muted-foreground">
        <span>PDF preview could not load — try Open</span>
        <Button type="button" size="sm" variant="secondary" onClick={onOpen}>
          Open PDF
        </Button>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- pdf.js first-page raster
    <img
      src={thumbUrl}
      alt=""
      draggable={false}
      className="block h-auto w-auto max-h-none max-w-none object-contain"
      loading="eager"
      onDoubleClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
    />
  );
}

/** `local:` / `drive:` / `PL_ATTACH_V1` — PC hover preview: local/pending pehle, phir Drive (HTTPS image path alag). */
export function LocalFileRefTooltipPreview({
  url,
  gallery,
  companyId: companyIdProp,
}: {
  url: string;
  gallery?: AttachmentPreviewGalleryOpts;
  companyId?: string | null;
}) {
  const voucherAttachmentFb = useVoucherAttachmentFallback();
  const companyId = companyIdProp ?? voucherAttachmentFb?.companyId ?? null;
  const effectiveUrl = React.useMemo(() => normalizeAttachmentUrlForDevicePreview(url), [url]);
  const [state, setState] = React.useState<
    | { status: "loading" }
    | { status: "error" }
    | { status: "ready"; objectUrl: string; mime: string; blob?: Blob }
  >({ status: "loading" });

  React.useEffect(() => {
    let cancelled = false;
    const urlRef = { current: null as string | null };
    void (async () => {
      try {
        if (usesEmbeddedNativeAttachmentStorage() && isLocalFileRef(effectiveUrl)) {
          const meta = getLocalFileRefMetaSync(effectiveUrl) ?? (await getLocalFileRefMeta(effectiveUrl));
          if (cancelled) return;
          if (meta?.displayUrl && (meta.filePath || meta.fileUri)) {
            const mime = String(meta.contentType || "application/octet-stream").toLowerCase();
            setState({ status: "ready", objectUrl: meta.displayUrl, mime });
            return;
          }
        }
        const { resolvePlServerStaffAttachmentPreviewBlob } = await import("@/lib/plServerAttachmentFetch");
        const blob = await resolvePlServerStaffAttachmentPreviewBlob(effectiveUrl, {
          galleryUrls: gallery?.urls,
          companyId: companyId ?? undefined,
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
        setState({ status: "ready", objectUrl, mime, blob });
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
  }, [url, effectiveUrl, gallery?.urls, companyId]);

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
      companyId &&
      (isLocalFileRef(effectiveUrl) || voucherAttachmentFb?.interCompanyPeer)
        ? {
            companyId,
            voucherId: voucherAttachmentFb?.voucherId ?? "",
            clientFileUrls: gallery?.urls,
            interCompanyPeer: voucherAttachmentFb?.interCompanyPeer,
          }
        : undefined;
    void openAttachmentInApp(effectiveUrl, { kind, gallery: multi, serverFallback });
  }, [effectiveUrl, state, gallery, voucherAttachmentFb, companyId]);

  const canRemoteFetch = canFetchPlServerAttachmentForCompany(companyId);

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
        <span>{canRemoteFetch ? "File on server PC — Open to load preview" : "File stored on this device"}</span>
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
        <LocalPdfBlobHoverPreview
          sourceUrl={objectUrl}
          blob={state.status === "ready" ? state.blob : undefined}
          onOpen={openAttachment}
        />
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
export function MultiAttachmentPortalPreview({ urls }: { urls: readonly string[] }) {
  const gallery = useAttachmentPreviewGallery();
  const list = React.useMemo(
    () => urls.map((u) => String(u || "").trim()).filter(Boolean),
    [urls]
  );

  if (list.length === 0) {
    return (
      <div className="flex min-h-[120px] min-w-[200px] flex-col items-center justify-center gap-1 p-6 text-center text-sm text-muted-foreground">
        <span>No preview</span>
        <span className="text-xs opacity-80">No file attached</span>
      </div>
    );
  }

  const activeIndex =
    gallery && gallery.urls.length > 1
      ? Math.min(Math.max(gallery.index, 0), list.length - 1)
      : 0;
  const currentUrl = list[activeIndex] ?? list[0]!;

  return (
    <SingleAttachmentHoverPreviewBody
      url={currentUrl}
      gallery={list.length > 1 ? { urls: list, startIndex: activeIndex } : undefined}
    />
  );
}

export function SingleAttachmentHoverPreviewBody({
  url,
  gallery,
}: {
  url: string;
  gallery?: AttachmentPreviewGalleryOpts;
}) {
  const { company } = useCompany();
  const voucherAttachmentFb = useVoucherAttachmentFallback();
  const localLedgerOnly =
    companyRequiresLocalAttachmentUrlsOnly(company) || embeddedAttachmentDisplayUsesLocalBytesOnly();
  const attachmentMode = companyAttachmentMode(company, { localLedgerOnly });
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
  const effectiveUrl = normalizeAttachmentUrlForDevicePreview(u);
  const cleanUrl = effectiveUrl.split("?")[0].toLowerCase();
  // `drive:` / `PL_ATTACH` ko HTTPS image branch mat bhejo — wahan spinner atka rehta tha.
  const usesDeviceBlobPreview = isLocalFileRef(effectiveUrl) || isDriveFileRef(effectiveUrl);
  const storagePathRaw = !usesDeviceBlobPreview ? tryGetStoragePathFromFirebaseDownloadUrl(u) : null;
  const pathLower = (storagePathRaw || "").toLowerCase();
  const fmt = getAttachmentFormatLabel(effectiveUrl || u);
  const isImage =
    !usesDeviceBlobPreview &&
    (["JPG", "JPEG", "PNG", "GIF", "WEBP", "BMP", "SVG", "HEIC", "HEIF"].includes(fmt) ||
      u.startsWith("data:image/") ||
      effectiveUrl.startsWith("data:image/") ||
      /\.(jpe?g|png|gif|webp|bmp|svg)(\?|$)/i.test(cleanUrl));
  const isPdf =
    !usesDeviceBlobPreview &&
    (fmt === "PDF" ||
      u.startsWith("data:application/pdf") ||
      effectiveUrl.startsWith("data:application/pdf") ||
      cleanUrl.endsWith(".pdf") ||
      effectiveUrl.toLowerCase().includes(".pdf") ||
      pathLower.includes(".pdf"));
  const galleryOpts = gallery;
  const openAtt = () =>
    void openAttachmentInApp(effectiveUrl, {
      kind: isImage ? "image" : isPdf ? "pdf" : "other",
      localLedgerOnly,
      gallery:
        galleryOpts && galleryOpts.urls.length > 1
          ? { urls: galleryOpts.urls, startIndex: galleryOpts.startIndex }
          : undefined,
      serverFallback:
        voucherAttachmentFb?.companyId && voucherAttachmentFb?.voucherId
          ? {
              companyId: voucherAttachmentFb.companyId,
              voucherId: voucherAttachmentFb.voucherId,
              clientFileUrls: galleryOpts?.urls,
              interCompanyPeer: voucherAttachmentFb.interCompanyPeer,
            }
          : company?.id
            ? { companyId: company.id, voucherId: "" }
            : undefined,
    });
  const storagePath = storagePathRaw ?? undefined;
  const caption = usesDeviceBlobPreview ? (isPdf ? "PDF" : fmt === "FILE" ? "" : fmt) : isPdf ? "PDF" : fmt;
  const attachmentGallery =
    galleryOpts && galleryOpts.urls.length > 1
      ? { urls: [...galleryOpts.urls], startIndex: galleryOpts.startIndex }
      : undefined;

  /** Bahar AttachmentHoverPortal — yahi markup FilePreview hoverPanel ke image branch jaisa (taaki zoom/width sahi) */
  return (
    <div className="flex w-max max-w-none flex-col gap-1">
      {usesDeviceBlobPreview ? (
        <LocalFileRefTooltipPreview
          url={u}
          gallery={galleryOpts}
          companyId={voucherAttachmentFb?.companyId ?? company?.id}
        />
      ) : isImage ? (
        <HoverPreviewHttpsAwareImage
          url={u}
          localLedgerOnly={localLedgerOnly}
          companyMode={attachmentMode}
          companyId={voucherAttachmentFb?.companyId ?? company?.id}
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
            attachmentCompanyId={voucherAttachmentFb?.companyId ?? company?.id ?? undefined}
            holdAttachmentClipboard={false}
          />
        </div>
      )}
      {caption ? (
        <p className="text-center text-[10px] font-semibold text-muted-foreground">{caption}</p>
      ) : null}
    </div>
  );
}
