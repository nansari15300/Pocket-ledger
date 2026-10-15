"use client";

import type React from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { mdc, mdcNoEdgeSwipeCapture } from "@/lib/mobileDetailChrome";

export type MasterListChromeChevronToggleProps = {
  /** Section / row open — arrow down; closed — arrow up. */
  expanded: boolean;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  variant?: "inline" | "floating" | "row" | "toolbar";
  className?: string;
  iconClassName?: string;
  ariaLabelWhenExpanded?: string;
  ariaLabelWhenCollapsed?: string;
  onPointerDown?: (e: React.PointerEvent<HTMLButtonElement>) => void;
};

const variantClass = {
  inline: mdc.summaryFabInline,
  floating: cn(mdc.summaryFab, mdc.summaryFabPosition),
  row: cn(
    mdc.summaryFabInline,
    "h-7 w-7 min-h-7 min-w-7 shadow-md",
  ),
  /** Search row ke right — search box ke barabar height (globals CSS). */
  toolbar: cn(mdc.summaryFabInline, "shrink-0 shadow-sm"),
};

/** List / detail chrome — blue circle; expanded = ↓, collapsed = ↑. */
export function MasterListChromeChevronToggle({
  expanded,
  onClick,
  variant = "inline",
  className,
  iconClassName,
  ariaLabelWhenExpanded = "Hide section",
  ariaLabelWhenCollapsed = "Show section",
  onPointerDown,
}: MasterListChromeChevronToggleProps) {
  return (
    <button
      type="button"
      data-pl-master-list-chrome-chevron-toggle=""
      onClick={onClick}
      onPointerDown={onPointerDown}
      aria-expanded={expanded}
      aria-label={expanded ? ariaLabelWhenExpanded : ariaLabelWhenCollapsed}
      className={cn(
        variantClass[variant],
        variant === "inline" &&
          "h-[var(--pl-mobile-txn-footer-row-h,2.625rem)] w-[var(--pl-mobile-txn-footer-row-h,2.625rem)] min-h-[var(--pl-mobile-txn-footer-row-h,2.625rem)] min-w-[var(--pl-mobile-txn-footer-row-h,2.625rem)]",
        variant === "toolbar" && "h-[var(--pl-mobile-txn-footer-row-h,2.25rem)] w-[var(--pl-mobile-txn-footer-row-h,2.25rem)] min-h-[var(--pl-mobile-txn-footer-row-h,2.25rem)] min-w-[var(--pl-mobile-txn-footer-row-h,2.25rem)] rounded-md",
        className
      )}
      {...mdcNoEdgeSwipeCapture}
    >
      {expanded ? (
        <ChevronDown className={cn(mdc.summaryFabIcon, iconClassName)} aria-hidden />
      ) : (
        <ChevronUp className={cn(mdc.summaryFabIcon, iconClassName)} aria-hidden />
      )}
    </button>
  );
}
