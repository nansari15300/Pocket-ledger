"use client";

import React from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useDate } from "@/hooks/useDate";

export type ReportStatementSummaryCardData = {
  title: string;
  amount: number;
  color: string;
};

const ReportStatementSummaryCard = React.memo(function ReportStatementSummaryCard({
  title,
  amount,
  color,
}: ReportStatementSummaryCardData) {
  const { formatCurrency, formatCurrencyForPrint } = useDate();
  const formatted = formatCurrency(amount, { showDrCr: title === "Balance" });
  const titleStr = formatCurrencyForPrint(amount, { showDrCr: title === "Balance" });
  return (
    <Card
      className={cn(
        "min-w-0 w-full overflow-hidden rounded-lg border px-2 py-1.5 shadow-none",
        "pl-dashboard-tone-card pl-dashboard-ribbon-emerald"
      )}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-[11px] font-medium leading-tight text-muted-foreground">{title}</p>
        <p
          className={cn("break-all text-xs font-bold tabular-nums leading-tight sm:text-sm", color)}
          title={titleStr}
        >
          {formatted}
        </p>
      </div>
    </Card>
  );
}, (prev, next) => prev.title === next.title && prev.amount === next.amount && prev.color === next.color);

/** Party Statement left panel — Balance/Sales top row, Purchases/Money In/Out bottom row. */
export function ReportStatementSummaryCardsGrid({
  cards,
  className,
}: {
  cards: ReportStatementSummaryCardData[];
  className?: string;
}) {
  const topRow = cards.slice(0, 2);
  const bottomRow = cards.slice(2);
  return (
    <div className={cn("min-w-0 space-y-1.5", className)} data-pl-party-statement-summary>
      <div className="grid grid-cols-2 gap-1.5">
        {topRow.map((card) => (
          <ReportStatementSummaryCard key={card.title} {...card} />
        ))}
      </div>
      {bottomRow.length > 0 ? (
        <div className="grid grid-cols-3 gap-1.5">
          {bottomRow.map((card) => (
            <ReportStatementSummaryCard key={card.title} {...card} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Mobile horizontal strip — same card chrome as grid. */
export function ReportStatementSummaryCardsRow({
  cards,
  className,
}: {
  cards: ReportStatementSummaryCardData[];
  className?: string;
}) {
  return (
    <div className={cn("flex flex-nowrap gap-2 overflow-x-auto scrollbar-slim-dim", className)}>
      {cards.map((card) => (
        <div key={card.title} className="w-[148px] shrink-0">
          <ReportStatementSummaryCard {...card} />
        </div>
      ))}
    </div>
  );
}
