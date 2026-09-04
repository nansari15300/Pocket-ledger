"use client";

import {
  type BalanceSheetDiffTraceLang,
  type BalanceSheetFiscalYearContext,
  balanceSheetFiscalYearDisplayRangeLabel,
  balanceSheetFiscalYearNotSetLabel,
  balanceSheetMasterOpeningFiscalNote,
} from "@/lib/reports/balanceSheetDifferenceTraceLocales";
import { cn } from "@/lib/utils";

type BalanceSheetFiscalYearDisplayProps = {
  ctx: BalanceSheetFiscalYearContext;
  variant: "master" | "trace";
  lang?: BalanceSheetDiffTraceLang;
  className?: string;
  labelClassName?: string;
  noteClassName?: string;
};

export function BalanceSheetFiscalYearDisplay({
  ctx,
  variant,
  lang = "en",
  className,
  labelClassName,
  noteClassName,
}: BalanceSheetFiscalYearDisplayProps) {
  const rangeLabel = balanceSheetFiscalYearDisplayRangeLabel(ctx, lang);
  const titleLabel = "Company fiscal year";
  const note =
    variant === "master" ? balanceSheetMasterOpeningFiscalNote(ctx, lang) : null;

  return (
    <div className={cn("space-y-1.5", className)}>
      <p
        className={cn(
          "text-[11px] sm:text-xs leading-relaxed",
          labelClassName
        )}
      >
        <span className="font-medium">{titleLabel}: </span>
        {!ctx.isSavedSet ? (
          <span className="tabular-nums font-medium">
            {balanceSheetFiscalYearNotSetLabel(lang)} {rangeLabel}
          </span>
        ) : (
          <span className="tabular-nums font-medium">{rangeLabel}</span>
        )}
      </p>
      {note ? <p className={cn("leading-relaxed", noteClassName)}>{note}</p> : null}
    </div>
  );
}
