
"use client";
import React from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "../ui/button";
import AnimatedNumber from "../ui/AnimatedNumber";
import { useDate } from "@/hooks/useDate";
import { cn } from "@/lib/utils";

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
  mobileSelectionLabel?: string | null;
  mobileSelectionLabelClassName?: string;
  mobileDetailHeaderEnd?: React.ReactNode;
}) {
  const isNegative = typeof balance === 'string' && balance.includes('Cr');

  if (isMobile) {
    // mobileListOnly + selected: show detail with back button (fix: party/staff list tap pe response nahi tha)
    if (mobileListOnly && hasSelectedItem) {
      return (
        <div className="h-full w-full overflow-hidden bg-background flex flex-col">
          <div className="p-2 border-b flex items-center gap-2 flex-shrink-0">
            <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" onClick={onBackToList} aria-label="Back to list">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex-1 min-w-0 flex items-center gap-1.5">
              <h1 className="text-base font-bold shrink-0">{title}</h1>
              {mobileSelectionLabel ? (
                <>
                  <span className="text-muted-foreground/55 shrink-0 select-none" aria-hidden>
                    ·
                  </span>
                  <span
                    className={cn(
                      "text-sm font-medium truncate min-w-0",
                      mobileSelectionLabelClassName ?? "text-muted-foreground"
                    )}
                    title={mobileSelectionLabel}
                  >
                    {mobileSelectionLabel}
                  </span>
                </>
              ) : null}
            </div>
            {mobileDetailHeaderEnd ? (
              <div className="flex-shrink-0 text-xs text-muted-foreground whitespace-nowrap max-w-[45%] truncate text-right">
                {mobileDetailHeaderEnd}
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
          <div className="flex flex-col flex-1 min-h-0">
            <div className="p-4 border-b flex-shrink-0">
              <div className="flex justify-between items-center gap-2 min-w-0">
                <h1 className="text-xl font-bold font-headline min-w-0 flex-1">{title}</h1>
                <span className={cn("font-semibold text-sm flex-shrink-0", isNegative ? "text-red-600" : "text-green-600")}>{balance}</span>
              </div>
            </div>
            {tabs && <div className="p-3 border-b flex-shrink-0">{tabs}</div>}
            {/* overflow-hidden + flex column taaki andar ScrollArea ko height mile; overflow-auto yahan nested scroll tod deta tha */}
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{listView}</div>
          </div>
        </div>
      );
    }
    return (
      <div className="h-full w-full overflow-hidden bg-background flex flex-col">
        {/* List on top, detail below */}
        <div className="flex flex-col min-h-0 border-b flex-shrink-0" style={{ maxHeight: "45%" }}>
          <div className="p-4 border-b flex-shrink-0">
            <div className="flex justify-between items-center gap-2 min-w-0">
              <h1 className="text-xl font-bold font-headline min-w-0 flex-1">{title}</h1>
              <span className={cn("font-semibold text-sm flex-shrink-0", isNegative ? "text-red-600" : "text-green-600")}>{balance}</span>
            </div>
          </div>
          {tabs && <div className="p-3 border-b flex-shrink-0">{tabs}</div>}
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
      // min-h-0: parent flex (dashboard main) ke andar grid shrink kar sake, andar scroll sahi kaam kare
      className="grid h-full min-h-0 grid-cols-1 overflow-hidden md:[grid-template-columns:minmax(0,25%)_minmax(0,1fr)]"
      data-master-detail-layout="25-75"
    >
      <div className="flex min-h-0 min-w-0 flex-col overflow-hidden border-r">
        <div className="p-4 border-b flex justify-between items-center flex-shrink-0 gap-2 min-w-0">
          <h1 className="text-xl font-bold truncate min-w-0 flex-1">{title}</h1>
          <span className={cn("font-semibold text-sm whitespace-nowrap flex-shrink-0", isNegative ? "text-red-600" : "text-green-600")}>{balance}</span>
        </div>
        {tabs && <div className="p-3 border-b flex-shrink-0">{tabs}</div>}
        {/* PC: yahan bhi flex column zaroori — warna listView ka flex-1 apply nahi hota, ScrollArea ko height nahi milti */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{listView}</div>
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{detailView}</div>
    </div>
  );
}
