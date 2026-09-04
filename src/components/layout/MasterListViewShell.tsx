"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { mlc, mlcListChromeRoot, mlcListChromeRootData } from "@/lib/mobileListChrome";
import {
  EntityListQuickFilterBar,
  type EntityListQuickFilter,
} from "@/components/entity/EntityListQuickFilterBar";

/** Mobile: search/section/action/tabs/filter niche dock; PC: chrome upar (party layout global). */
export function MasterListViewShell({
  isMobile,
  searchRow,
  sectionLabel,
  actionRow,
  tabs,
  quickFilter,
  onQuickFilterChange,
  footerSummary,
  children,
}: {
  isMobile: boolean;
  searchRow: React.ReactNode;
  sectionLabel?: React.ReactNode;
  actionRow?: React.ReactNode;
  tabs?: React.ReactNode;
  quickFilter?: EntityListQuickFilter;
  onQuickFilterChange?: (next: EntityListQuickFilter) => void;
  footerSummary?: React.ReactNode;
  children: React.ReactNode;
}) {
  const showQuickFilter =
    quickFilter != null && onQuickFilterChange != null;

  const quickFilterBar = showQuickFilter ? (
    <EntityListQuickFilterBar
      active={quickFilter}
      onChange={onQuickFilterChange}
      className={footerSummary ? "border-t-0 pt-0" : undefined}
    />
  ) : null;

  const footerDock = showQuickFilter || footerSummary ? (
    <div className="flex-shrink-0 border-t border-blue-300/60 bg-blue-100/80">
      {footerSummary}
      {quickFilterBar}
    </div>
  ) : null;

  const mobileDock = isMobile ? (
    <div className={mlc.mobileListDock} data-pl-mobile-list-dock="">
      {searchRow}
      {sectionLabel}
      {actionRow}
      {tabs ? <div className={mlc.tabsRow}>{tabs}</div> : null}
      {footerDock}
    </div>
  ) : null;

  return (
    <div
      className={cn(mlcListChromeRoot, "flex h-full min-h-0 flex-col")}
      {...mlcListChromeRootData}
    >
      {!isMobile ? searchRow : null}
      {!isMobile ? actionRow : null}
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        {!isMobile ? sectionLabel : null}
        <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
        {!isMobile ? footerDock : null}
      </div>
      {mobileDock}
    </div>
  );
}
