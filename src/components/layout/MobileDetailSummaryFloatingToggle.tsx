"use client";

/**
 * Mobile: summary hide/show — `inline` = pagination ke just upar; `fixed` = report list (no pager).
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { MasterListChromeChevronToggle } from "@/components/layout/MasterListChromeChevronToggle";
import { useMobileDetailSummaryCollapsed } from "@/contexts/MobileDetailSummaryCollapseContext";
import { useAppModalOverlayOpen } from "@/hooks/useAppModalOverlayOpen";

export type MobileDetailSummaryFloatingToggleProps = {
  /** `inline`: pager wrapper ke upar; `fixed`: body portal (report register list). */
  placement?: "inline" | "fixed";
  /** Popup ledger ke pager par bhi FAB dikhana; default dialogs me hide behavior same rahe. */
  allowInOverlay?: boolean;
};

export function MobileDetailSummaryFloatingToggle({
  placement = "fixed",
  allowInOverlay = false,
}: MobileDetailSummaryFloatingToggleProps) {
  const { collapsed, toggle } = useMobileDetailSummaryCollapsed();
  const overlayOpen = useAppModalOverlayOpen();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Print / edit dialogs ke upar chevron na dikhe
  if (overlayOpen && !allowInOverlay) {
    return null;
  }

  const toggleEl = (
    <MasterListChromeChevronToggle
      expanded={!collapsed}
      onClick={() => toggle()}
      variant={placement === "inline" ? "inline" : "floating"}
      className={cn(placement === "inline" && "pointer-events-auto")}
      ariaLabelWhenExpanded="Hide summary and filters"
      ariaLabelWhenCollapsed="Show summary and filters"
    />
  );

  if (placement === "inline") {
    return toggleEl;
  }

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(toggleEl, document.body);
}
