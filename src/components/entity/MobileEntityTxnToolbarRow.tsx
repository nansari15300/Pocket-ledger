"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { mdc, mdcMobileTxnToolbarRowData } from "@/lib/mobileDetailChrome";
import { useMobileDetailSummaryCollapsed } from "@/contexts/MobileDetailSummaryCollapseContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { MasterListChromeChevronToggle } from "@/components/layout/MasterListChromeChevronToggle";
import { PendingApprovalListFilterBadge } from "@/components/layout/PendingApprovalListFilterBadge";

/** Mobile entity txn header — picker + edit + search; pill = search chrome (globals). */
export function MobileEntityTxnToolbarRow({
  className,
  children,
  placement = "summary",
}: {
  className?: string;
  children: React.ReactNode;
  /** `belowPager` — pagination ke neeche; summary collapse se bahar. */
  placement?: "summary" | "belowPager";
}) {
  const belowPager = placement === "belowPager";
  const isMobile = useIsMobile();
  const { collapsed, toggle } = useMobileDetailSummaryCollapsed();
  const showInlineFooterChevron = belowPager && isMobile && !collapsed;

  if (belowPager && isMobile && collapsed) {
    return null;
  }

  return (
    <div
      className={cn(
        belowPager ? mdc.mobileTxnToolbarRowBelowPager : mdc.mobileTxnToolbarRow,
        className
      )}
      {...mdcMobileTxnToolbarRowData}
      {...(belowPager ? { "data-pl-mobile-txn-toolbar-below-pager": "" } : {})}
    >
      <div className={mdc.mobileTxnToolbarInner}>
        <div className={mdc.mobileTxnToolbarInnerContent} data-pl-mobile-txn-toolbar-inner-content="">
          {children}
        </div>
        {showInlineFooterChevron ? (
          <MasterListChromeChevronToggle
            expanded={!collapsed}
            onClick={() => toggle()}
            variant="inline"
            className="pl-mobile-ledger-footer-fab shrink-0 rounded-full"
            ariaLabelWhenExpanded="Hide footer controls"
            ariaLabelWhenCollapsed="Show footer controls"
          />
        ) : null}
      </div>
    </div>
  );
}

export function MobileEntityTxnToolbarPicker({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn(mdc.mobileTxnToolbarPickerWrap, className)}>{children}</div>;
}

export function MobileEntityTxnToolbarSearch({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn(mdc.mobileTxnToolbarSearchWrap, className)}>{children}</div>;
}

/** Picker + search ke beech — master list jaisa pink count; click = ledger unapproved-only filter. */
export function MobileEntityTxnToolbarUnapprovedBadge({
  count,
  pressed,
  onToggle,
}: {
  count: number;
  pressed: boolean;
  onToggle: () => void;
}) {
  if (count <= 0) return null;
  return (
    <PendingApprovalListFilterBadge
      compact
      count={count}
      pressed={pressed}
      onToggle={onToggle}
      tooltipFilterHint={`Show only unapproved (${count}) — click`}
      tooltipShowAllHint="Show all transactions (click)"
      ariaLabelFilter={`Filter ${count} unapproved transactions`}
      ariaLabelShowAll="Show all transactions"
    />
  );
}
