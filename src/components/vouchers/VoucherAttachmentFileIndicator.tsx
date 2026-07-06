"use client";

import * as React from "react";
import { CheckCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAttachmentUrlsReadyState } from "@/hooks/useAttachmentUrlsReadyState";

type Props = {
  urls: readonly string[];
  className?: string;
  size?: "sm" | "md";
  "aria-label"?: string;
};

/** File column / OB row — loading = spinner, ready = green tick (poori app me same). */
export function VoucherAttachmentFileIndicator({
  urls,
  className,
  size = "md",
  "aria-label": ariaLabel = "Attachment",
}: Props) {
  const readyState = useAttachmentUrlsReadyState(urls);
  const iconClass = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";

  if (readyState === "loading") {
    return (
      <span className={cn("inline-flex", className)} aria-label={`${ariaLabel} loading`}>
        <Loader2 className={cn(iconClass, "animate-spin text-muted-foreground")} />
      </span>
    );
  }

  return (
    <span className={cn("inline-flex", className)} aria-label={`${ariaLabel} ready`}>
      <CheckCircle className={cn(iconClass, "text-green-600")} />
    </span>
  );
}
