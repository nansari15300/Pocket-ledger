"use client";

import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

/** Wrapper for pill controls inside a synced pair — always fill the equal column. */
export const SYNCED_PILL_PAIR_CELL_CN = "min-w-0 w-full";

/**
 * Two pills that always share equal column width on desktop.
 * Both grow and shrink together; never size independently by content.
 */
export function SyncedPillPair({
  leftHeader,
  rightHeader,
  leftPill,
  rightPill,
  leftPillClassName,
  rightPillClassName,
  className,
}: {
  leftHeader: React.ReactNode;
  rightHeader: React.ReactNode;
  leftPill: React.ReactNode;
  rightPill: React.ReactNode;
  leftPillClassName?: string;
  rightPillClassName?: string;
  className?: string;
}) {
  const isMobile = useIsMobile();

  return (
    <div
      className={cn(
        "w-full min-w-0 gap-3",
        isMobile ? "flex flex-col" : "grid grid-cols-2",
        className
      )}
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        {leftHeader}
        <div className={cn(SYNCED_PILL_PAIR_CELL_CN, leftPillClassName)}>{leftPill}</div>
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        {rightHeader}
        <div className={cn(SYNCED_PILL_PAIR_CELL_CN, rightPillClassName)}>{rightPill}</div>
      </div>
    </div>
  );
}
