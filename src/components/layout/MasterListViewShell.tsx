"use client";

import React, { useEffect, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { mlc, mlcListChromeRoot, mlcListChromeRootData } from "@/lib/mobileListChrome";
import { mdcNoEdgeSwipeCapture } from "@/lib/mobileDetailChrome";
import {
  EntityListQuickFilterBar,
  type EntityListQuickFilter,
} from "@/components/entity/EntityListQuickFilterBar";

const LIST_DOCK_COLLAPSED_KEY = "pl-mobile-list-dock-collapsed";

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
  const [dockCollapsed, setDockCollapsed] = useState(false);

  useEffect(() => {
    if (!isMobile) return;
    try {
      setDockCollapsed(window.localStorage.getItem(LIST_DOCK_COLLAPSED_KEY) === "1");
    } catch {
      // Private mode: dock stays open this session.
    }
  }, [isMobile]);

  const toggleDock = () => {
    setDockCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(LIST_DOCK_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        // Ignore storage failures.
      }
      return next;
    });
  };

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
      {tabs ? <div className={mlc.tabsRow}>{tabs}</div> : null}
      {sectionLabel}
      {actionRow}
      {searchRow}
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
        {isMobile ? (
          <button
            type="button"
            onClick={toggleDock}
            className="pointer-events-auto absolute bottom-2 left-1/2 z-30 flex h-10 w-10 -translate-x-1/2 items-center justify-center rounded-full border border-blue-500 bg-blue-100 text-blue-600 shadow-lg hover:bg-blue-200 active:scale-95"
            aria-expanded={!dockCollapsed}
            aria-label={dockCollapsed ? "Show list footer rows" : "Hide list footer rows"}
            {...mdcNoEdgeSwipeCapture}
          >
            {dockCollapsed ? (
              <ChevronDown className="h-5 w-5" aria-hidden />
            ) : (
              <ChevronUp className="h-5 w-5" aria-hidden />
            )}
          </button>
        ) : null}
        {!isMobile ? footerDock : null}
      </div>
      {isMobile && !dockCollapsed ? mobileDock : null}
    </div>
  );
}
