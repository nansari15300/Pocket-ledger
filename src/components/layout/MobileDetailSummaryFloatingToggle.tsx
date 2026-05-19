"use client";

/**
 * Mobile: summary hide/show — `inline` = pagination ke just upar; `fixed` = report list (no pager).
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { mdc, mdcNoEdgeSwipeCapture } from "@/lib/mobileDetailChrome";
import { useMobileDetailSummaryCollapsed } from "@/contexts/MobileDetailSummaryCollapseContext";
import { useAppModalOverlayOpen } from "@/hooks/useAppModalOverlayOpen";

export type MobileDetailSummaryFloatingToggleProps = {
  /** `inline`: pager wrapper ke upar; `fixed`: body portal (report register list). */
  placement?: "inline" | "fixed";
};

export function MobileDetailSummaryFloatingToggle({
  placement = "fixed",
}: MobileDetailSummaryFloatingToggleProps) {
  const { collapsed, toggle } = useMobileDetailSummaryCollapsed();
  const overlayOpen = useAppModalOverlayOpen();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Print / edit dialogs ke upar chevron na dikhe
  if (overlayOpen) {
    return null;
  }

  const button = (
    <button
      type="button"
      onClick={toggle}
      className={cn(
        "pointer-events-auto",
        placement === "inline" ? mdc.summaryFabInline : cn(mdc.summaryFab, mdc.summaryFabPosition)
      )}
      aria-expanded={!collapsed}
      aria-label={collapsed ? "Show summary and filters" : "Hide summary and filters"}
      {...mdcNoEdgeSwipeCapture}
    >
      {collapsed ? (
        <ChevronDown className={mdc.summaryFabIcon} aria-hidden />
      ) : (
        <ChevronUp className={mdc.summaryFabIcon} aria-hidden />
      )}
    </button>
  );

  if (placement === "inline") {
    return button;
  }

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(button, document.body);
}
