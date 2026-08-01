"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilePreview } from "@/components/vouchers/FilePreview";
import { openAttachmentInApp } from "@/lib/openAttachmentInApp";
import { isOnlineCompanyAttachmentNetworkAllowed } from "@/lib/onlineCompanySelectorSyncPolicy";
import { tryGetStoragePathFromFirebaseDownloadUrl, looksLikeFirebaseStorageObjectPath } from "@/lib/firebaseStorageDownloadUrl";
import {
  isLocalFileRef,
  getLocalFileRefMeta,
  getLocalFileRefMetaSync,
  getBlobFromLocalFileRef,
} from "@/lib/localPendingFiles";
import {
  VoucherAttachmentFallbackContext,
  useVoucherAttachmentFallback,
} from "@/contexts/VoucherAttachmentFallbackContext";
import { getAttachmentFormatLabel, sniffBlobKindForPreview } from "@/lib/attachmentFormatLabel";
import {
  getRemoteAttachmentBlobPreferOfflineCache,
  seedOfflineAttachmentCacheFromBlob,
  tryOfflineCachedAttachmentBlobMultiKey,
} from "@/lib/offlineAttachmentUrlCache";
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
import { readActiveAttachmentCompanyId } from "@/lib/firestorePermissionSuppress";
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

  const warmOne = async (url: string): Promise<void> => {
    if (options?.signal?.aborted) return;
    if (peekHoverCachedBlobUrl(url)) {
      markAttachmentUrlReady(url);
      return;
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
      if (!blob || blob.size === 0) return;
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
  };

  // Parallel pool — serial await made PL-server gallery page flips ~20s for 10 thumbs.
  const pool = Math.min(8, Math.max(1, unique.length));
  let cursor = 0;
  const workers = Array.from({ length: pool }, async () => {
    while (cursor < unique.length) {
      if (options?.signal?.aborted) return;
      const i = cursor++;
      await warmOne(unique[i]!);
    }
  });
  await Promise.all(workers);
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
const PDF_HOVER_RASTER_TIMEOUT_MS = 20_000;

function pdfPortalCacheKey(url: string): string {
  return `${url}::pdf-portal`;
}

/** EXE/APK: pl-attachments / blob cache; web: online par HTTPS allowed. */
function HoverPreviewHttpsAwareImage(props: {
  url: string;
  alt?: string;
  className?: string;
  loading?: React.ImgHTMLAttributes<HTMLImageElement>["loading"];
  onDoubleClick?: React.MouseEventHandler<HTMLImageElement>;
  localLedgerOnly?: boolean;
  /** Company Selector Files tick — network download/upload. */
  filesNetworkAllowed?: boolean;
  companyId?: string;
  companyMode?: CompanyAttachmentMode;
}) {
  const u = String(props.url || "");
  const localBytesOnly = props.localLedgerOnly === true || embeddedAttachmentDisplayUsesLocalBytesOnly();
  const filesNetworkAllowed = props.filesNetworkAllowed !== false;
  const [displaySrc, setDisplaySrc] = React.useState<string>(() => {
    if (!/^https?:\/\//i.test(u)) {
      if (u.startsWith("blob:") || u.startsWith("data:")) return u;
      const fromLru = peekHoverCachedBlobUrl(u);
      if (fromLru) return fromLru;
      return "";
    }
    const fromLru = peekHoverCachedBlobUrl(u);
    if (fromLru) return fromLru;
    // Files untick / local-only: raw HTTPS mat — pehle IndexedDB/blob cache.
    if (!localBytesOnly && typeof navigator !== "undefined" && navigator.onLine) {
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
        // Local-only: HTTPS displayUrl mat — network gate bypass ho jata.
        if (localBytesOnly && /^https?:\/\//i.test(displayUrl)) {
          /* fall through to blob / fail */
        } else {
          setLoadFailed(false);
          setDisplaySrc(displayUrl);
          if (!localBytesOnly && /^https?:\/\//i.test(displayUrl)) {
            void import("@/lib/offlineAttachmentUrlCache")
              .then(({ getRemoteAttachmentBlobPreferOfflineCache }) =>
                getRemoteAttachmentBlobPreferOfflineCache(displayUrl, ac.signal, {
                  companyId: props.companyId,
                  awaitDiskWrite: false,
                })
              )
              .then((cached) => {
                if (cancelled || !cached || cached.size <= 0) return;
                const ou = URL.createObjectURL(cached);
                rememberHoverBlobUrl(u, ou);
              })
              .catch(() => {});
          }
          return;
        }
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
        // Web pe raw HTTPS dikha — IndexedDB me likho taaki Files untick ke baad local open chale.
        void import("@/lib/offlineAttachmentUrlCache")
          .then(({ getRemoteAttachmentBlobPreferOfflineCache }) =>
            getRemoteAttachmentBlobPreferOfflineCache(u, ac.signal, {
              companyId: props.companyId,
              awaitDiskWrite: false,
            })
          )
          .then((cached) => {
            if (cancelled || !cached || cached.size <= 0) return;
            const ou = URL.createObjectURL(cached);
            rememberHoverBlobUrl(u, ou);
          })
          .catch(() => {});
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
      setDisplaySrc((prev) => (prev.startsWith("blob:") || prev.startsWith("data:") ? prev : prev || ""));
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

    // Local-only: purana raw HTTPS src mat rakho (Files untick ke baad network leak).
    if (!canInstantHttps) {
      setDisplaySrc((prev) => {
        if (prev.startsWith("blob:") || prev.startsWith("data:")) return prev;
        return "";
      });
    } else {
      setDisplaySrc((prev) => prev || u);
    }

    void resolveStaticAttachmentDisplay(u, {
      localLedgerOnly: localBytesOnly,
      companyMode: props.companyMode,
      signal: ac.signal,
      companyId: props.companyId,
    })
      .then((resolved) => {
        if (cancelled) return;
        if (canInstantHttps) {
          if (resolved.blob && resolved.blob.size > 0) {
            applyResolved(resolved.displayUrl, resolved.blob);
            return;
          }
          applyResolved(resolved.displayUrl || u, null);
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
      const offline = typeof navigator !== "undefined" && !navigator.onLine;
      const failHint = !filesNetworkAllowed
        ? "Turn on Files in Company Selector (Online tab), then Save — or check your network. Already downloaded files still open."
        : offline
          ? "Connect once online to download, or wait for background sync. Or turn on Files in Company Selector if it is off."
          : "Check Files tick in Company Selector (Online tab) and Save, or check your network — then retry.";
      return (
        <div className="flex min-h-[200px] min-w-[220px] flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
          <span>File not on this device</span>
          <span className="text-xs opacity-80">{failHint}</span>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => {
              setLoadFailed(false);
              setDisplaySrc("");
              setReloadKey((k) => k + 1);
            }}
          >
            {filesNetworkAllowed ? "Retry download" : "Retry local"}
          </Button>
        </div>
      );
    }
    return (
      <div className="flex min-h-[200px] min-w-[220px] flex-col items-center justify-center gap-2 p-6">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-label="Loading preview" />
        {localBytesOnly ? (
          <span className="text-xs text-muted-foreground">
            {filesNetworkAllowed ? "Loading from device…" : "Looking for local file…"}
          </span>
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
  instantThumbUrl,
}: {
  sourceUrl: string;
  blob?: Blob | null;
  onOpen: () => void;
  /** Cell/hover JPEG already warm — show immediately while pdf.js optional upgrade runs. */
  instantThumbUrl?: string | null;
}) {
  const [thumbUrl, setThumbUrl] = React.useState<string | null>(() =>
    String(instantThumbUrl || "").trim() || null
  );
  const [loading, setLoading] = React.useState(() => !String(instantThumbUrl || "").trim());

  React.useEffect(() => {
    const warm = String(instantThumbUrl || "").trim();
    if (warm) {
      setThumbUrl(warm);
      setLoading(false);
    }
  }, [instantThumbUrl]);

  React.useEffect(() => {
    let cancelled = false;
    let created: string | null = null;
    const ac = new AbortController();
    const timeoutId = window.setTimeout(() => ac.abort(), PDF_HOVER_RASTER_TIMEOUT_MS);
    void (async () => {
      try {
        if (!String(instantThumbUrl || "").trim()) setLoading(true);
        let pdfBlob = blob && blob.size > 0 ? blob : null;
        if (!pdfBlob) {
          pdfBlob = await fetch(sourceUrl, { signal: ac.signal }).then((r) => (r.ok ? r.blob() : null));
        }
        if (ac.signal.aborted || cancelled) return;
        if (!pdfBlob?.size) throw new Error("empty_pdf");
        const kind = await sniffBlobKindForPreview(pdfBlob);
        if (kind !== "pdf") throw new Error("not_pdf");
        if (pdfBlob.type !== "application/pdf") {
          pdfBlob = new Blob([await pdfBlob.arrayBuffer()], { type: "application/pdf" });
        }
        const { convertPdfFirstPageToImage } = await import("@/lib/pdfToImage");
        const result = await convertPdfFirstPageToImage(pdfBlob, 0.92, 1800);
        if (cancelled || ac.signal.aborted) {
          URL.revokeObjectURL(result.thumbnailUrl);
          return;
        }
        created = result.thumbnailUrl;
        setThumbUrl(result.thumbnailUrl);
      } catch {
        if (!cancelled && !String(instantThumbUrl || "").trim()) setThumbUrl(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      ac.abort();
      if (created) {
        try {
          URL.revokeObjectURL(created);
        } catch {
          /* ignore */
        }
      }
    };
  }, [sourceUrl, blob, instantThumbUrl]);

  if (loading && !thumbUrl) {
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
      data-pdf-portal-page="1"
      src={thumbUrl}
      alt=""
      draggable={false}
      className="block h-auto w-auto max-h-none max-w-none object-contain"
      loading="eager"
      onLoad={() => {
        requestAnimationFrame(() => {
          window.dispatchEvent(new Event("resize"));
        });
      }}
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
  const { company } = useCompany();
  const companyId =
    companyIdProp ??
    voucherAttachmentFb?.companyId ??
    company?.id ??
    readActiveAttachmentCompanyId() ??
    null;
  const effectiveUrl = React.useMemo(() => normalizeAttachmentUrlForDevicePreview(url), [url]);
  const galleryUrlsKey = gallery?.urls?.join("\x1e") ?? "";
  const galleryDepKey =
    gallery && gallery.urls.length > 1 ? `${gallery.startIndex}:${galleryUrlsKey}` : galleryUrlsKey;

  const initialCached = React.useMemo(() => {
    const pdfPortal = peekHoverCachedBlobUrl(pdfPortalCacheKey(effectiveUrl));
    if (pdfPortal) return { objectUrl: pdfPortal, mime: "image/jpeg" as const, fromCellThumb: false };
    const cellThumb = peekHoverCachedBlobUrl(`${effectiveUrl}::cell-thumb`);
    const full = peekHoverCachedBlobUrl(effectiveUrl);
    const fmt = getAttachmentFormatLabel(effectiveUrl);
    if (fmt === "PDF" && !full) return null;
    // Full bytes pehle — cell-thumb sirf instant paint (blurry 300% zoom avoid).
    const cachedPreviewUrl = full || cellThumb;
    if (!cachedPreviewUrl) return null;
    if (full) {
      if (fmt === "PDF") {
        return { objectUrl: full, mime: "application/pdf" as const, fromCellThumb: false };
      }
      return { objectUrl: full, mime: "image/jpeg" as const, fromCellThumb: false };
    }
    // Cell thumb = JPEG raster (incl. PDF first page). `local:` URL label is often "FILE".
    return { objectUrl: cellThumb!, mime: "image/jpeg" as const, fromCellThumb: true };
  }, [effectiveUrl]);

  const [state, setState] = React.useState<
    | { status: "loading" }
    | { status: "error" }
    | { status: "ready"; objectUrl: string; mime: string; blob?: Blob; fromCellThumb?: boolean }
  >(() =>
    initialCached
      ? {
          status: "ready",
          objectUrl: initialCached.objectUrl,
          mime: initialCached.mime,
          fromCellThumb: initialCached.fromCellThumb,
        }
      : { status: "loading" }
  );
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    const urlRef = { current: null as string | null };
    const ac = new AbortController();
    const timeoutId = window.setTimeout(() => ac.abort(), EMBEDDED_PREVIEW_DOWNLOAD_TIMEOUT_MS);
    const cid = companyId ?? readActiveAttachmentCompanyId() ?? undefined;

    const cellThumb = peekHoverCachedBlobUrl(`${effectiveUrl}::cell-thumb`);
    const pdfPortal = peekHoverCachedBlobUrl(pdfPortalCacheKey(effectiveUrl));
    const fullCached = peekHoverCachedBlobUrl(effectiveUrl);
    if (pdfPortal) {
      setState({ status: "ready", objectUrl: pdfPortal, mime: "image/jpeg", fromCellThumb: false });
      window.clearTimeout(timeoutId);
      return () => {
        cancelled = true;
        ac.abort();
      };
    }
    void (async () => {
      try {
        const persistedPortal = await tryOfflineCachedAttachmentBlobMultiKey(pdfPortalCacheKey(effectiveUrl));
        if (cancelled || !persistedPortal?.size) return;
        const portalUrl = URL.createObjectURL(persistedPortal);
        urlRef.current = portalUrl;
        rememberHoverBlobUrl(pdfPortalCacheKey(effectiveUrl), portalUrl);
        setState({ status: "ready", objectUrl: portalUrl, mime: "image/jpeg", fromCellThumb: false });
        window.clearTimeout(timeoutId);
      } catch {
        /* optional */
      }
    })();
    if (fullCached) {
      const fmt = getAttachmentFormatLabel(effectiveUrl);
      if (fmt === "PDF") {
        setState({ status: "ready", objectUrl: fullCached, mime: "application/pdf", fromCellThumb: false });
        // Continue async — attach blob / optional upgrade.
      } else {
        setState({
          status: "ready",
          objectUrl: fullCached,
          mime: "image/jpeg",
          fromCellThumb: false,
        });
        window.clearTimeout(timeoutId);
        return () => {
          cancelled = true;
          ac.abort();
        };
      }
    } else if (cellThumb && getAttachmentFormatLabel(effectiveUrl) !== "PDF") {
      // Instant paint from cell thumb, then continue async to upgrade to full bytes.
      setState({ status: "ready", objectUrl: cellThumb, mime: "image/jpeg", fromCellThumb: true });
    } else {
      setState({ status: "loading" });
    }

    void (async () => {
      try {
        let blob: Blob | null = null;

        if (fullCached) {
          try {
            const fromHover = await fetch(fullCached, { signal: ac.signal }).then((r) =>
              r.ok ? r.blob() : null
            );
            if (fromHover && fromHover.size > 0) blob = fromHover;
          } catch {
            /* fall through */
          }
        }

        if (!blob?.size) {
          try {
            const { tryOfflineCachedAttachmentBlobMultiKey } = await import(
              "@/lib/offlineAttachmentUrlCache"
            );
            blob = await tryOfflineCachedAttachmentBlobMultiKey(effectiveUrl);
          } catch {
            /* cache optional */
          }
        }

        const { isPlRemoteServerClientMode, isPlSharingServerPortOrigin } = await import(
          "@/lib/plRemoteServerClient"
        );
        const staffRemote = isPlRemoteServerClientMode() || isPlSharingServerPortOrigin();
        if (!blob?.size && !staffRemote && isLocalFileRef(effectiveUrl)) {
          blob = await getBlobFromLocalFileRef(effectiveUrl, {
            companyId: cid,
          });
        }
        if (
          !blob?.size &&
          !staffRemote &&
          usesEmbeddedNativeAttachmentStorage() &&
          isLocalFileRef(effectiveUrl)
        ) {
          const meta = getLocalFileRefMetaSync(effectiveUrl) ?? (await getLocalFileRefMeta(effectiveUrl));
          if (meta?.displayUrl && (meta.filePath || meta.fileUri)) {
            try {
              const fetched = await fetch(meta.displayUrl, { signal: ac.signal }).then((r) =>
                r.ok ? r.blob() : null
              );
              if (fetched && fetched.size > 0) blob = fetched;
            } catch {
              /* fall through */
            }
          }
        }
        if (!blob || blob.size <= 0) {
          const { resolvePlServerStaffAttachmentPreviewBlob } = await import("@/lib/plServerAttachmentFetch");
          blob = await resolvePlServerStaffAttachmentPreviewBlob(effectiveUrl, {
            galleryUrls: gallery?.urls,
            companyId: cid,
            signal: ac.signal,
          });
        }
        if (cancelled) return;
        if (!blob || blob.size === 0) {
          setState((prev) => (prev.status === "ready" ? prev : { status: "error" }));
          return;
        }
        let mime = String(blob.type || "application/octet-stream").toLowerCase();
        if (mime === "application/octet-stream" || !blob.type || mime === "binary/octet-stream") {
          const kind = await sniffBlobKindForPreview(blob);
          if (kind === "pdf") mime = "application/pdf";
          else if (kind === "image") mime = "image/jpeg";
        }
        if (mime.includes("pdf") && blob.type !== "application/pdf") {
          blob = new Blob([await blob.arrayBuffer()], { type: "application/pdf" });
          mime = "application/pdf";
        }
        if (mime.includes("pdf")) {
          const { convertPdfFirstPageToImage } = await import("@/lib/pdfToImage");
          const result = await convertPdfFirstPageToImage(blob, 0.92, 1800);
          if (cancelled) {
            URL.revokeObjectURL(result.thumbnailUrl);
            return;
          }
          urlRef.current = result.thumbnailUrl;
          rememberHoverBlobUrl(pdfPortalCacheKey(effectiveUrl), result.thumbnailUrl);
          void seedOfflineAttachmentCacheFromBlob(pdfPortalCacheKey(effectiveUrl), result.thumbnailBlob);
          setState({ status: "ready", objectUrl: result.thumbnailUrl, mime: "image/jpeg", fromCellThumb: false });
          return;
        }
        const objectUrl = URL.createObjectURL(blob);
        urlRef.current = objectUrl;
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          urlRef.current = null;
          return;
        }
        rememberHoverBlobUrl(effectiveUrl, objectUrl);
        // Don't seed full key into cell-thumb — keep thumb separate so portal can upgrade.
        // Don't replace a working cell-thumb image with "octet-stream" / unknown type UI.
        if (!mime.startsWith("image/") && !mime.includes("pdf") && cellThumb) {
          return;
        }
        setState({ status: "ready", objectUrl, mime, blob, fromCellThumb: false });
      } catch {
        if (!cancelled) {
          setState((prev) => (prev.status === "ready" ? prev : { status: "error" }));
        }
      }
    })();
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      ac.abort();
      urlRef.current = null;
    };
  }, [url, effectiveUrl, galleryDepKey, companyId, reloadKey]);

  const openAttachment = React.useCallback(() => {
    const kind: "pdf" | "image" | "other" =
      state.status === "ready" && state.mime.startsWith("image/")
        ? "image"
        : state.status === "ready" && (state.mime === "application/pdf" || state.mime.includes("pdf"))
          ? "pdf"
          : getAttachmentFormatLabel(effectiveUrl) === "PDF"
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
    void openAttachmentInApp(effectiveUrl, {
      kind,
      gallery: multi,
      serverFallback,
      gateCompany: company,
    });
  }, [effectiveUrl, state, gallery, voucherAttachmentFb, companyId, company]);

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
        <span>
          {canRemoteFetch
            ? "Could not load preview from server — try Open or Retry"
            : "File stored on this device — try Open"}
        </span>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={() => setReloadKey((n) => n + 1)}>
            Retry
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={openAttachment}>
            Open
          </Button>
        </div>
      </div>
    );
  }

  const { objectUrl, mime } = state;
  const isImage = mime.startsWith("image/");
  const isPdf = mime === "application/pdf" || mime.includes("pdf");
  const cellThumbForPdf =
    isPdf || state.fromCellThumb
      ? peekHoverCachedBlobUrl(`${effectiveUrl}::cell-thumb`)
      : null;

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
          instantThumbUrl={null}
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

export function MultiAttachmentPortalPreview({
  urls,
  companyId: companyIdProp,
  voucherId,
}: {
  urls: readonly string[];
  companyId?: string | null;
  voucherId?: string | null;
}) {
  const gallery = useAttachmentPreviewGallery();
  const { companyId: shellCompanyId } = useCompany();
  const list = React.useMemo(
    () => urls.map((u) => String(u || "").trim()).filter(Boolean),
    [urls]
  );
  const urlsKey = React.useMemo(() => list.join("\x1e"), [list]);
  const activeIndex =
    gallery && gallery.urls.length > 1
      ? Math.min(Math.max(gallery.index, 0), Math.max(list.length - 1, 0))
      : 0;
  const galleryOpts = React.useMemo(
    () => (list.length > 1 ? { urls: list, startIndex: activeIndex } : undefined),
    [urlsKey, activeIndex, list]
  );

  if (list.length === 0) {
    return (
      <div className="flex min-h-[120px] min-w-[200px] flex-col items-center justify-center gap-1 p-6 text-center text-sm text-muted-foreground">
        <span>No preview</span>
        <span className="text-xs opacity-80">No file attached</span>
      </div>
    );
  }

  const currentUrl = list[activeIndex] ?? list[0]!;

  const body = (
    <SingleAttachmentHoverPreviewBody
      url={currentUrl}
      companyId={companyIdProp ?? shellCompanyId ?? readActiveAttachmentCompanyId()}
      gallery={galleryOpts}
    />
  );
  const cid = String(companyIdProp ?? shellCompanyId ?? readActiveAttachmentCompanyId() ?? "").trim();
  const vid = String(voucherId || "").trim();
  if (!cid || !vid) return body;
  return (
    <VoucherAttachmentFallbackContext.Provider value={{ companyId: cid, voucherId: vid }}>
      {body}
    </VoucherAttachmentFallbackContext.Provider>
  );
}

export function SingleAttachmentHoverPreviewBody({
  url,
  gallery,
  companyId: companyIdProp,
}: {
  url: string;
  gallery?: AttachmentPreviewGalleryOpts;
  companyId?: string | null;
}) {
  const { company } = useCompany();
  const voucherAttachmentFb = useVoucherAttachmentFallback();
  const filesNetworkAllowed =
    !company?.id || isOnlineCompanyAttachmentNetworkAllowed(String(company.id), company);
  const localLedgerOnly =
    companyRequiresLocalAttachmentUrlsOnly(company) ||
    embeddedAttachmentDisplayUsesLocalBytesOnly() ||
    !filesNetworkAllowed;
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
      gateCompany: company,
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
          companyId={companyIdProp ?? voucherAttachmentFb?.companyId ?? company?.id ?? readActiveAttachmentCompanyId()}
        />
      ) : isImage ? (
        <HoverPreviewHttpsAwareImage
          url={u}
          localLedgerOnly={localLedgerOnly}
          filesNetworkAllowed={filesNetworkAllowed}
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
            forceLocalAttachmentOnly={!filesNetworkAllowed}
          />
        </div>
      )}
      {caption ? (
        <p className="text-center text-[10px] font-semibold text-muted-foreground">{caption}</p>
      ) : null}
    </div>
  );
}
