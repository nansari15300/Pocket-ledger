"use client";

import React from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { mdc, mdcNoEdgeSwipeCapture } from "@/lib/mobileDetailChrome";
import { mlc } from "@/lib/mobileListChrome";
import { ResizeWidthHandle, useResizablePercentWidth } from "@/components/layout/ResizablePaneWidth";

/**
 * Admin Panel Company copy of ResponsiveMasterDetail layout chrome.
 * No useDate / useCompany — safe to mount under admin routes only.
 */
export function AdminPanelMasterDetail({
  title,
  balance,
  listView,
  detailView,
  isMobile,
  mobileListOnly,
  hasSelectedItem,
  onBackToList,
  mobileSelectionLabel,
}: {
  title: string | React.ReactNode;
  balance: string | React.ReactNode;
  listView: React.ReactNode;
  detailView: React.ReactNode;
  isMobile?: boolean;
  mobileListOnly?: boolean;
  hasSelectedItem?: boolean;
  onBackToList?: () => void;
  mobileSelectionLabel?: string | null;
}) {
  const isNegative = typeof balance === "string" && balance.includes("Cr");
  const desktopGridRef = React.useRef<HTMLDivElement | null>(null);
  const { widthPercent: desktopListWidthPercent, beginResize: beginDesktopListResize } = useResizablePercentWidth({
    storageKey: "pl-admin-panel-master-list-width-percent",
    defaultPercent: 25,
    minPercent: 17.5,
    maxPercent: 32.5,
    containerRef: desktopGridRef,
  });

  if (isMobile) {
    if (mobileListOnly && hasSelectedItem) {
      return (
        <div className="flex h-full w-full flex-col overflow-hidden bg-background">
          <div className={mdc.masterBackRow} {...mdcNoEdgeSwipeCapture}>
            <Button variant="ghost" size="icon" className={mdc.backBtn} onClick={onBackToList} aria-label="Back to list">
              <ArrowLeft className={mdc.backIcon} />
            </Button>
            <div className="flex min-w-0 flex-1 items-center gap-1">
              <h1 className={mdc.masterTitle}>{title}</h1>
              {mobileSelectionLabel ? (
                <>
                  <span className="shrink-0 select-none text-muted-foreground/55" aria-hidden>
                    ·
                  </span>
                  <span className={cn(mdc.masterSelectionName, "text-muted-foreground")} title={mobileSelectionLabel}>
                    {mobileSelectionLabel}
                  </span>
                </>
              ) : null}
            </div>
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{detailView}</div>
        </div>
      );
    }

    if (mobileListOnly) {
      return (
        <div className="flex h-full w-full flex-col overflow-hidden bg-background">
          <div className="flex min-h-0 flex-1 flex-col" data-pl-master-list-chrome="">
            <div className={mlc.pageHeader}>
              <div className="flex min-w-0 items-center justify-between gap-2">
                <h1 className={mlc.pageTitle}>{title}</h1>
                <span className={cn(mlc.pageBalance, isNegative ? "text-red-600" : "text-green-600")}>{balance}</span>
              </div>
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{listView}</div>
          </div>
        </div>
      );
    }
  }

  return (
    <div
      ref={desktopGridRef}
      className="grid h-full min-h-0 grid-cols-1 overflow-hidden md:grid-cols-none"
      style={{ gridTemplateColumns: `minmax(0, ${desktopListWidthPercent}%) minmax(0, 1fr)` }}
      data-master-detail-layout="25-75"
    >
      <div className="relative flex min-h-0 min-w-0 flex-col overflow-hidden border-r" data-pl-master-list-chrome="">
        <div className={cn(mlc.pageHeader, "flex min-w-0 items-center justify-between gap-2")}>
          <h1 className={cn(mlc.pageTitle, "truncate")}>{title}</h1>
          <span className={cn(mlc.pageBalance, "whitespace-nowrap", isNegative ? "text-red-600" : "text-green-600")}>
            {balance}
          </span>
        </div>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{listView}</div>
        <ResizeWidthHandle onPointerDown={beginDesktopListResize} title="Resize list panel" />
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{detailView}</div>
    </div>
  );
}
