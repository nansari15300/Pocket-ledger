"use client";

import { cn } from "@/lib/utils";
import { useDate } from "@/hooks/useDate";
import type { CompanyFyVoucherSuggestion } from "@/lib/companyFyVoucherSuggestion";

type Props = {
  suggestion: CompanyFyVoucherSuggestion;
  className?: string;
};

export function CompanyFyVoucherSuggestionCard({ suggestion, className }: Props) {
  const { formatDateBySystem } = useDate();

  const displayDate = (date?: Date) => {
    if (!date || Number.isNaN(date.getTime())) return "—";
    return formatDateBySystem(date);
  };

  const showHint = suggestion.showFyHint !== false;

  return (
    <div
      className={cn(
        "pl-dashboard-tone-card pl-dashboard-ribbon-amber rounded-lg border bg-card px-3 py-2.5 text-xs text-amber-950 shadow-none",
        className
      )}
      role="status"
    >
      {showHint ? (
        <p className="font-medium leading-snug">
          {suggestion.allFySplitted
            ? "Your all FY is splitted."
            : (
                <>
                  Your transactions span <span className="font-semibold">{suggestion.fyCount}</span> fiscal years (
                  {suggestion.countryFyLabel}), but fiscal year is not set.
                </>
              )}
        </p>
      ) : (
        <p className="font-medium leading-snug text-amber-900/80">Voucher date range</p>
      )}
      <div className={cn("space-y-1", showHint ? "mt-2 border-t border-amber-400/55 pt-2" : "mt-1.5")}>
        <div className="flex items-start justify-between gap-2">
          <span className="text-amber-900/70">First voucher</span>
          <span className="font-medium text-right tabular-nums">{displayDate(suggestion.voucherDateFrom)}</span>
        </div>
        <div className="flex items-start justify-between gap-2">
          <span className="text-amber-900/70">Last voucher</span>
          <span className="font-medium text-right tabular-nums">{displayDate(suggestion.voucherDateTo)}</span>
        </div>
      </div>
    </div>
  );
}
