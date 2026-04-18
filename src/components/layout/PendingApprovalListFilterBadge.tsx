"use client";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type PendingApprovalListFilterBadgeProps = {
  /** Toolbar total: kitne unapproved vouchers is entity type ko touch karte hain */
  count: number;
  pressed: boolean;
  onToggle: () => void;
  tooltipFilterHint: string;
  tooltipShowAllHint: string;
  ariaLabelFilter: string;
  ariaLabelShowAll: string;
};

/** Master list: search aur + Add ke beech pink count — click se sirf pending wale rows (party page pattern) */
export function PendingApprovalListFilterBadge({
  count,
  pressed,
  onToggle,
  tooltipFilterHint,
  tooltipShowAllHint,
  ariaLabelFilter,
  ariaLabelShowAll,
}: PendingApprovalListFilterBadgeProps) {
  if (count <= 0) return null;

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onToggle}
            className={cn(
              // `w-fit` + tabular-nums — digit count ke hisaab se width
              "inline-flex h-9 w-fit max-w-[5rem] shrink-0 items-center justify-center rounded-md border px-1.5 text-xs font-bold tabular-nums transition-colors sm:px-2",
              pressed
                ? "border-pink-600 bg-pink-600 text-white shadow-sm"
                : "border-pink-200 bg-pink-100 text-pink-900 hover:bg-pink-200/90 dark:border-pink-800 dark:bg-pink-950/60 dark:text-pink-100 dark:hover:bg-pink-900/50"
            )}
            aria-pressed={pressed}
            aria-label={pressed ? ariaLabelShowAll : ariaLabelFilter}
          >
            {count}
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          {pressed ? tooltipShowAllHint : tooltipFilterHint}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
