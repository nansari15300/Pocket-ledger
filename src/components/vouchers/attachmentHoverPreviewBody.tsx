"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilePreview } from "@/components/vouchers/FilePreview";
import { openAttachmentInApp } from "@/lib/openAttachmentInApp";
import { tryGetStoragePathFromFirebaseDownloadUrl } from "@/lib/firebaseStorageDownloadUrl";
import { isLocalFileRef, getBlobFromLocalFileRef } from "@/lib/localPendingFiles";
import { getAttachmentFormatLabel, sniffBlobKindForPreview } from "@/lib/attachmentFormatLabel";

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
  const [state, setState] = React.useState<
    { status: "loading" } | { status: "error" } | { status: "ready"; objectUrl: string; mime: string }
  >({ status: "loading" });

  React.useEffect(() => {
    let cancelled = false;
    const urlRef = { current: null as string | null };
    void (async () => {
      try {
        const blob = await getBlobFromLocalFileRef(url);
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
      if (urlRef.current) {
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
    void openAttachmentInApp(url, { kind, gallery: multi });
  }, [url, state, gallery]);

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

  return (
    <div className="flex max-w-[min(96vw,800px)] flex-shrink-0 flex-col gap-1">
      <div className="flex min-h-[400px] items-center justify-center overflow-hidden rounded-lg border bg-background">
        {isImage ? (
          // eslint-disable-next-line @next/next/no-img-element -- blob: preview
          <img
            src={objectUrl}
            alt=""
            className="h-auto max-h-[75vh] w-auto max-w-full cursor-pointer object-contain"
            loading="eager"
            onClick={openAttachment}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && openAttachment()}
          />
        ) : isPdf ? (
          <FilePreview
            file={objectUrl}
            size={800}
            disabled={false}
            objectFit="contain"
            enableHoverFullPreview={false}
            showFormatBadge={false}
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
  const u = String(url);
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

  return (
    <div className="flex w-full max-w-full flex-col gap-1">
      <div className="flex min-h-[320px] w-full items-center justify-center overflow-hidden rounded-lg border bg-background">
        {isLocalPending ? (
          <LocalFileRefTooltipPreview url={u} gallery={galleryOpts} />
        ) : isImage ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed URL / data URL preview
          <img
            src={u}
            alt=""
            className="h-auto max-h-[75vh] w-auto max-w-full cursor-pointer object-contain"
            loading="eager"
            onClick={openAtt}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && openAtt()}
          />
        ) : (
          <FilePreview
            file={u}
            storagePath={storagePath}
            size={800}
            disabled={false}
            objectFit="contain"
            enableHoverFullPreview={false}
            showFormatBadge={false}
            attachmentGallery={attachmentGallery}
          />
        )}
      </div>
      <p className="text-center text-[10px] font-semibold text-muted-foreground">{caption}</p>
    </div>
  );
}
