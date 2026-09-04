
"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "../ui/button";
import { Sheet, SheetContent } from "../ui/sheet";
import { cn } from "@/lib/utils";
import { mdc, mdcNoEdgeSwipeCapture } from "@/lib/mobileDetailChrome";
import { mlc } from "@/lib/mobileListChrome";
import type { MasterDetailListRouteKey } from "@/lib/masterDetailListPath";
import { ResizeWidthHandle, useResizablePercentWidth } from "@/components/layout/ResizablePaneWidth";
import {
  useEdgeSwipeDocumentCapture,
  type EdgeSwipeDocumentOptions,
} from "@/hooks/useMobileEdgeSwipe";

/** Mobile detail: daen kinara ~10mm — swipe left → list sheet (Settings jaisa) */
const MOBILE_DETAIL_LIST_SHEET_EDGE: EdgeSwipeDocumentOptions = { edgeWidthMm: 10 };

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
  mobileSelectionLabel,
  mobileSelectionLabelClassName,
  mobileDetailHeaderEnd,
  listChromeRouteKey,
  mobileTabsDocked,
  /** Changes when user picks list row — closes mobile list sheet */
  mobileListSelectionKey,
}: {
  title: string | React.ReactNode;
  balance: string | React.ReactNode;
  tabs?: React.ReactNode;
  listView: React.ReactNode;
  detailView: React.ReactNode;
  onCreate?: () => void;
  isMobile?: boolean;
  mobileListOnly?: boolean;
  hasSelectedItem?: boolean;
  onBackToList?: () => void;
  mobileSelectionLabel?: React.ReactNode;
  mobileSelectionLabelClassName?: string;
  mobileDetailHeaderEnd?: React.ReactNode;
  listChromeRouteKey?: MasterDetailListRouteKey;
  mobileTabsDocked?: boolean;
  mobileListSelectionKey?: string | null;
}) {
  const listChromeRouteData = listChromeRouteKey
    ? ({ "data-pl-master-list-route": listChromeRouteKey } as const)
    : {};
  const dockTabsOnMobile = mobileTabsDocked ?? Boolean(isMobile && mobileListOnly);
  const isNegative = typeof balance === "string" && balance.includes("Cr");
  const desktopGridRef = React.useRef<HTMLDivElement | null>(null);
  const { widthPercent: desktopListWidthPercent, beginResize: beginDesktopListResize } = useResizablePercentWidth({
    storageKey: "pl-master-list-width-percent",
    defaultPercent: 25,
    minPercent: 17.5,
    maxPercent: 32.5,
    containerRef: desktopGridRef,
  });

  const [mobileListSheetOpen, setMobileListSheetOpen] = useState(false);
  const openMobileListSheet = useCallback(() => setMobileListSheetOpen(true), []);
  const closeMobileListSheet = useCallback(() => setMobileListSheetOpen(false), []);
  const prevSelectionKeyRef = useRef<string | null | undefined>(undefined);

  const showMobileDetailWithSheet =
    Boolean(isMobile && mobileListOnly && hasSelectedItem);

  useEdgeSwipeDocumentCapture(
    showMobileDetailWithSheet && !mobileListSheetOpen,
    "right",
    openMobileListSheet,
    MOBILE_DETAIL_LIST_SHEET_EDGE
  );

  useEffect(() => {
    if (!mobileListSheetOpen) {
      prevSelectionKeyRef.current = mobileListSelectionKey;
      return;
    }
    const prev = prevSelectionKeyRef.current;
    if (
      prev !== undefined &&
      mobileListSelectionKey != null &&
      mobileListSelectionKey !== prev
    ) {
      setMobileListSheetOpen(false);
    }
    prevSelectionKeyRef.current = mobileListSelectionKey;
  }, [mobileListSelectionKey, mobileListSheetOpen]);

  const sheetSwipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const onSheetTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) {
      sheetSwipeStartRef.current = null;
      return;
    }
    const t = e.touches[0];
    sheetSwipeStartRef.current = { x: t.clientX, y: t.clientY };
  }, []);
  const onSheetTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!sheetSwipeStartRef.current || e.changedTouches.length !== 1) {
        sheetSwipeStartRef.current = null;
        return;
      }
      const t = e.changedTouches[0];
      const dx = t.clientX - sheetSwipeStartRef.current.x;
      const dy = Math.abs(t.clientY - sheetSwipeStartRef.current.y);
      sheetSwipeStartRef.current = null;
      if (dy > Math.abs(dx) * 0.65) return;
      if (dx >= 44) closeMobileListSheet();
    },
    [closeMobileListSheet]
  );

  const mobileListSheet = showMobileDetailWithSheet ? (
    <Sheet open={mobileListSheetOpen} onOpenChange={setMobileListSheetOpen}>
      <SheetContent
        side="right"
        className={cn(
          "flex h-full max-h-[100dvh] min-h-0 w-[80vw] max-w-[80vw] min-w-0 flex-col gap-0 overflow-hidden p-0",
          "[&>button]:hidden"
        )}
        onTouchStart={onSheetTouchStart}
        onTouchEnd={onSheetTouchEnd}
        data-pl-master-detail-list-sheet=""
      >
        <div
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
          data-pl-master-list-chrome=""
          {...listChromeRouteData}
        >
          {tabs ? <div className={cn(mlc.tabsRow, "flex-shrink-0")}>{tabs}</div> : null}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{listView}</div>
        </div>
      </SheetContent>
    </Sheet>
  ) : null;

  if (isMobile) {
    if (mobileListOnly && hasSelectedItem) {
      return (
        <>
          <div className="h-full w-full overflow-hidden bg-background flex flex-col">
            <div className={mdc.masterBackRow} {...mdcNoEdgeSwipeCapture} data-pl-mobile-back-row="">
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
            <div className="flex-1 min-h-0 overflow-hidden flex flex-col">{detailView}</div>
          </div>
          {mobileListSheet}
        </>
      );
    }
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
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{listView}</div>
          </div>
        </div>
      );
    }
    return (
      <div className="h-full w-full overflow-hidden bg-background flex flex-col">
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
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">{detailView}</div>
      </div>
    );
  }

  return (
    <div
      ref={desktopGridRef}
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
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{listView}</div>
        <ResizeWidthHandle onPointerDown={beginDesktopListResize} title="Resize list panel" />
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{detailView}</div>
    </div>
  );
}
