
"use client";
import React from "react";
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
  mobileListOnly
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
}) {
  const isNegative = typeof balance === 'string' && balance.includes('Cr');

  if (isMobile) {
    // List-only mode: show only list; details open in separate page on tap
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
            <div className="flex-1 min-h-0 overflow-auto">{listView}</div>
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
          <div className="flex-1 min-h-0 overflow-auto">{listView}</div>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">{detailView}</div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-[minmax(280px,auto)_minmax(0,1fr)] h-full overflow-hidden">
      <div className="flex flex-col min-h-0 border-r overflow-hidden">
        <div className="p-4 border-b flex justify-between items-center flex-shrink-0 gap-2 min-w-0">
          <h1 className="text-xl font-bold truncate min-w-0 flex-1">{title}</h1>
          <span className={cn("font-semibold text-sm whitespace-nowrap flex-shrink-0", isNegative ? "text-red-600" : "text-green-600")}>{balance}</span>
        </div>
        {tabs && <div className="p-3 border-b flex-shrink-0">{tabs}</div>}
        <div className="flex-1 min-h-0 overflow-hidden">{listView}</div>
      </div>
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">{detailView}</div>
    </div>
  );
}
