"use client";

import * as React from "react";
import { CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAttachmentUrlsReadyState } from "@/hooks/useAttachmentUrlsReadyState";
import {
  invalidateAttachmentThumbDisplayUrl,
  useAttachmentThumbDisplayUrl,
} from "@/hooks/useAttachmentThumbDisplayUrl";
import { useCompany } from "@/hooks/useCompany";
import { isWebBrowserAttachmentLazyLoad } from "@/lib/webAttachmentLazyLoadPolicy";
import { isOnlineCompanyFilesUiAllowed } from "@/lib/onlineCompanySelectorSyncPolicy";

type Props = {
  urls: readonly string[];
  className?: string;
  size?: "sm" | "md";
  displayMode?: "preview" | "tick";
  companyId?: string;
  "aria-label"?: string;
};

/** File column / OB row — Preview = square; Tick only = check. Files tick OFF: local cache only (no download). */
export function VoucherAttachmentFileIndicator({
  urls,
  className,
  size = "md",
  displayMode = "preview",
  companyId: companyIdProp,
  "aria-label": ariaLabel = "Attachment",
}: Props) {
  const { company, companyId: shellCid } = useCompany();
  const companyId = companyIdProp ?? shellCid;
  const filesNetworkAllowed =
    !companyId || isOnlineCompanyFilesUiAllowed(String(companyId), company);
  const primaryUrl = React.useMemo(
    () => urls.map((u) => String(u || "").trim()).find(Boolean),
    [urls]
  );
  const readyState = useAttachmentUrlsReadyState(urls);
  const [thumbRetryKey, setThumbRetryKey] = React.useState(0);
  React.useEffect(() => {
    setThumbRetryKey(0);
  }, [primaryUrl, displayMode]);
  const wantsPreview = displayMode === "preview";
  // Network blocked inside cache when Files off + companyId; local cache still returns.
  const allowThumbLoad =
    wantsPreview &&
    (readyState === "ready" || isWebBrowserAttachmentLazyLoad() || !filesNetworkAllowed);
  const thumbUrl = useAttachmentThumbDisplayUrl(
    primaryUrl,
    allowThumbLoad,
    companyId,
    thumbRetryKey
  );
  const fileCount = urls.map((u) => String(u || "").trim()).filter(Boolean).length;
  if (fileCount === 0) return null;
  const isReady = readyState === "ready";
  const iconClass = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  const thumbClass = size === "sm" ? "h-7 w-7" : "h-8 w-8";
  const countBadgeClass =
    size === "sm"
      ? "absolute -bottom-0.5 -right-0.5 flex h-3.5 min-w-[0.875rem] items-center justify-center rounded-full border border-background bg-primary px-0.5 text-[8px] font-bold leading-none tabular-nums text-primary-foreground"
      : "absolute -bottom-0.5 -right-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full border border-background bg-primary px-0.5 text-[9px] font-bold leading-none tabular-nums text-primary-foreground";

  const countBadge =
    fileCount > 1 ? (
      <span className={countBadgeClass} aria-hidden="true">
        {fileCount}
      </span>
    ) : null;

  if (wantsPreview) {
    const canShowThumb =
      !!thumbUrl &&
      thumbRetryKey < 4 &&
      (isReady || isWebBrowserAttachmentLazyLoad() || !filesNetworkAllowed);
    if (canShowThumb) {
      return (
        <span
          className={cn(
            "relative inline-flex overflow-hidden rounded border border-border/80 bg-muted/30",
            thumbClass,
            className
          )}
          aria-label={fileCount > 1 ? `${ariaLabel} preview (${fileCount} files)` : `${ariaLabel} preview`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- warmed blob / pdf raster */}
          <img
            key={`${thumbUrl}:${thumbRetryKey}`}
            src={thumbUrl!}
            alt=""
            className="h-full w-full object-cover"
            draggable={false}
            onError={() => {
              invalidateAttachmentThumbDisplayUrl(primaryUrl, thumbUrl);
              setThumbRetryKey((n) => n + 1);
            }}
          />
          {countBadge}
        </span>
      );
    }
    return (
      <span
        className={cn(
          "relative inline-flex items-center justify-center overflow-hidden rounded border border-border/80 bg-muted/40",
          thumbClass,
          className
        )}
        aria-label={
          fileCount > 1 ? `${ariaLabel} preview (${fileCount} files)` : `${ariaLabel} preview`
        }
      >
        {countBadge}
      </span>
    );
  }

  return (
    <span
      className={cn("relative inline-flex", className)}
      aria-label={
        fileCount > 1
          ? `${ariaLabel} ${isReady ? "ready" : "URL only"} (${fileCount} files)`
          : `${ariaLabel} ${isReady ? "ready" : "URL only"}`
      }
    >
      <CheckCircle className={cn(iconClass, isReady ? "text-green-600" : "text-red-600")} />
      {countBadge}
    </span>
  );
}
