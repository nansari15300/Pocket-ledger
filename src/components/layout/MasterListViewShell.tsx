"use client";

import React, { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { MasterListChromeChevronToggle } from "@/components/layout/MasterListChromeChevronToggle";
import { mlc, mlcListChromeRoot, mlcListChromeRootData } from "@/lib/mobileListChrome";
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
      className="border-0 bg-transparent py-0"
    />
  ) : null;

  const footerDock = showQuickFilter || footerSummary ? (
    <div
      className={cn(
        "pl-mlc-footer-stack w-full min-w-0 flex-shrink-0",
        !isMobile && "border-t border-blue-300/60 bg-blue-100/80",
      )}
    >
      {footerSummary}
      {quickFilterBar}
    </div>
  ) : null;

  const dockChevronToggle = isMobile ? (
    <MasterListChromeChevronToggle
      expanded={!dockCollapsed}
      onClick={toggleDock}
      variant="row"
      className="ml-auto flex-shrink-0"
      ariaLabelWhenExpanded="Hide list footer rows"
      ariaLabelWhenCollapsed="Show list footer rows"
    />
  ) : null;

  const mobileDock = isMobile ? (
    <div className={mlc.mobileListDock} data-pl-mobile-list-dock="">
      <div className="pl-mlc-dock-panel flex w-full min-w-0 flex-col gap-0 bg-blue-100/80 px-[2px] pb-[2px] pt-[2px] dark:bg-blue-950/35">
        {tabs ? (
          <div className={cn(mlc.tabsRow, "flex items-center gap-[2px] border-b-0")}>
            <div className="min-w-0 flex-1">{tabs}</div>
            {dockChevronToggle}
          </div>
        ) : null}
        {sectionLabel}
        {actionRow}
        {searchRow}
        {footerDock}
      </div>
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
        {isMobile && (dockCollapsed || !tabs) ? (
          <MasterListChromeChevronToggle
            expanded={!dockCollapsed}
            onClick={toggleDock}
            variant="row"
            className="pl-mobile-list-dock-fab pointer-events-auto absolute bottom-2 right-2 z-30 h-10 w-10 min-h-10 min-w-10"
            ariaLabelWhenExpanded="Hide list footer rows"
            ariaLabelWhenCollapsed="Show list footer rows"
          />
        ) : null}
        {!isMobile ? footerDock : null}
      </div>
      {isMobile && !dockCollapsed ? mobileDock : null}
    </div>
  );
}
