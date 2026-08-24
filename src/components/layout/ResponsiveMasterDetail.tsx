
"use client";
import React from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "../ui/button";
import AnimatedNumber from "../ui/AnimatedNumber";
import { useDate } from "@/hooks/useDate";
import { cn } from "@/lib/utils";
import { mdc, mdcNoEdgeSwipeCapture } from "@/lib/mobileDetailChrome";
import { mlc } from "@/lib/mobileListChrome";
import type { MasterDetailListRouteKey } from "@/lib/masterDetailListPath";
import { ResizeWidthHandle, useResizablePercentWidth } from "@/components/layout/ResizablePaneWidth";

export function ResponsiveMasterDetail({
  title,
  balance,
  tabs,
  listView,
  detailView,
  onCreate,
  isMobile,
  mobileListOnly,
  hasSelectedItem,
  onBackToList,
  /** Mobile detail header: selected party / group / account name next to page title */
  mobileSelectionLabel,
  /** Tailwind classes for {@link mobileSelectionLabel} (e.g. green/red from selected balance). Defaults to muted. */
  mobileSelectionLabelClassName,
  /** Mobile detail title row — right side (e.g. voucher count); niche duplicate row avoid */
  mobileDetailHeaderEnd,
  /** PC-only CSS tweaks per route (e.g. party tabs +20% height) */
  listChromeRouteKey,
  /** Mobile list: tabs listView footer me (title upar, list beech me) */
  mobileTabsDocked,
}: {
  title: string | React.ReactNode;
  balance: string | React.ReactNode;
  tabs?: React.ReactNode;
  listView: React.ReactNode;
  detailView: React.ReactNode;
  onCreate?: () => void;
  isMobile?: boolean;
  /** When true and isMobile, show only the list (full height); tapping an item should navigate to details page. */
  mobileListOnly?: boolean;
  /** When true and mobileListOnly, show detail view instead of list (mobile tap-to-detail flow) */
  hasSelectedItem?: boolean;
  /** Callback to go back to list when showing detail on mobile (Back button) */
  onBackToList?: () => void;
  mobileSelectionLabel?: React.ReactNode;
  mobileSelectionLabelClassName?: string;
  mobileDetailHeaderEnd?: React.ReactNode;
  listChromeRouteKey?: MasterDetailListRouteKey;
  mobileTabsDocked?: boolean;
}) {
  const listChromeRouteData = listChromeRouteKey
    ? ({ "data-pl-master-list-route": listChromeRouteKey } as const)
    : {};
  const dockTabsOnMobile = mobileTabsDocked ?? Boolean(isMobile && mobileListOnly);
  const isNegative = typeof balance === 'string' && balance.includes('Cr');
  const desktopGridRef = React.useRef<HTMLDivElement | null>(null);
  const { widthPercent: desktopListWidthPercent, beginResize: beginDesktopListResize } = useResizablePercentWidth({
    storageKey: "pl-master-list-width-percent",
    defaultPercent: 25,
    minPercent: 17.5,
    maxPercent: 32.5,
    containerRef: desktopGridRef,
  });

  if (isMobile) {
    // mobileListOnly + selected: show detail with back button (fix: party/staff list tap pe response nahi tha)
    if (mobileListOnly && hasSelectedItem) {
      return (
        <div className="h-full w-full overflow-hidden bg-background flex flex-col">
          {/* Mobile detail title — compact row (party/staff/bank list → detail) */}
          <div className={mdc.masterBackRow} {...mdcNoEdgeSwipeCapture}>
            <Button variant="ghost" size="icon" className={mdc.backBtn} onClick={onBackToList} aria-label="Back to list">
              <ArrowLeft className={mdc.backIcon} />
            </Button>
            <div className="flex min-w-0 flex-1 items-center gap-1">
              <h1 className={mdc.masterTitle}>{title}</h1>
              {mobileSelectionLabel ? (
                <>
                  <span className="text-muted-foreground/55 shrink-0 select-none" aria-hidden>
                    ·
                  </span>
                  {typeof mobileSelectionLabel === "string" ? (
                    <span
                      className={cn(
                        mdc.masterSelectionName,
                        mobileSelectionLabelClassName ?? "text-muted-foreground"
                      )}
                      title={mobileSelectionLabel}
                    >
                      {mobileSelectionLabel}
                    </span>
                  ) : (
                    mobileSelectionLabel
                  )}
                </>
              ) : null}
            </div>
            {mobileDetailHeaderEnd ? (
              <div className="flex-shrink-0">
                {typeof mobileDetailHeaderEnd === "string" || typeof mobileDetailHeaderEnd === "number" ? (
                  <div className="text-xs text-muted-foreground whitespace-nowrap max-w-[45%] truncate text-right">
                    {mobileDetailHeaderEnd}
                  </div>
                ) : (
                  mobileDetailHeaderEnd
                )}
              </div>
            ) : null}
          </div>
          {/* flex flex-col so detail (AccountGroupDetails etc.) ke andar scroll container ko height mile */}
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">{detailView}</div>
        </div>
      );
    }
    // List-only mode: show only list; tapping an item navigates via Link to ?selected=id
    if (mobileListOnly) {
      return (
        <div className="h-full w-full overflow-hidden bg-background flex flex-col">
          <div className="flex flex-col flex-1 min-h-0" data-pl-master-list-chrome="" {...listChromeRouteData}>
            <div className={mlc.pageHeader}>
              <div className="flex min-w-0 items-center justify-between gap-2">
                <h1 className={mlc.pageTitle}>{title}</h1>
                <span className={cn(mlc.pageBalance, isNegative ? "text-red-600" : "text-green-600")}>{balance}</span>
              </div>
            </div>
            {tabs && !dockTabsOnMobile && <div className={mlc.tabsRow}>{tabs}</div>}
            {/* overflow-hidden + flex column taaki andar ScrollArea ko height mile; overflow-auto yahan nested scroll tod deta tha */}
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{listView}</div>
          </div>
        </div>
      );
    }
    return (
      <div className="h-full w-full overflow-hidden bg-background flex flex-col">
        {/* List on top, detail below */}
        <div
          className="flex flex-col min-h-0 border-b flex-shrink-0"
          data-pl-master-list-chrome=""
          {...listChromeRouteData}
          style={{ maxHeight: "45%" }}
        >
          <div className={mlc.pageHeader}>
            <div className="flex min-w-0 items-center justify-between gap-2">
              <h1 className={mlc.pageTitle}>{title}</h1>
              <span className={cn(mlc.pageBalance, isNegative ? "text-red-600" : "text-green-600")}>{balance}</span>
            </div>
          </div>
          {tabs && <div className={mlc.tabsRow}>{tabs}</div>}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{listView}</div>
        </div>
        {/* flex flex-col so detail ke andar scroll container ko height mile */}
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">{detailView}</div>
      </div>
    );
  }

  // Desktop: list column 25% of yahi grid (sidebar alag), detail baki — lamba naam list failaaundaina
  return (
    <div
      ref={desktopGridRef}
      // min-h-0: parent flex (dashboard main) ke andar grid shrink kar sake, andar scroll sahi kaam kare
      className="grid h-full min-h-0 grid-cols-1 overflow-hidden md:grid-cols-none"
      style={{ gridTemplateColumns: `minmax(0, ${desktopListWidthPercent}%) minmax(0, 1fr)` }}
      data-master-detail-layout="25-75"
    >
      <div
        className="relative flex min-h-0 min-w-0 flex-col overflow-hidden border-r"
        data-pl-master-list-chrome=""
        {...listChromeRouteData}
      >
        <div className={cn(mlc.pageHeader, "flex justify-between items-center gap-2 min-w-0")}>
          <h1 className={cn(mlc.pageTitle, "truncate")}>{title}</h1>
          <span className={cn(mlc.pageBalance, "whitespace-nowrap", isNegative ? "text-red-600" : "text-green-600")}>{balance}</span>
        </div>
        {tabs && <div className={mlc.tabsRow}>{tabs}</div>}
        {/* PC: yahan bhi flex column zaroori — warna listView ka flex-1 apply nahi hota, ScrollArea ko height nahi milti */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{listView}</div>
        <ResizeWidthHandle onPointerDown={beginDesktopListResize} title="Resize list panel" />
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{detailView}</div>
    </div>
  );
}
