"use client";

import { Card, CardContent } from "@/components/ui/card";
import type { Loan } from "../types/loanTypes";
import { LoanStatusBadge } from "./LoanStatusBadge";
import { useDate } from "@/hooks/useDate";
import { cn } from "@/lib/utils";

export function LoanCard({
  loan,
  selected,
  onClick,
}: {
  loan: Loan;
  selected?: boolean;
  onClick?: () => void;
}) {
  const { formatCurrencyForPrint } = useDate();
  const money = (n: number) => formatCurrencyForPrint(n, { noAnimation: true, noSuffix: true, showDrCr: false });
  return (
    <button type="button" onClick={onClick} className="w-full text-left">
      <Card className={cn("transition hover:border-emerald-400", selected && "border-emerald-600 ring-1 ring-emerald-600")}>
        <CardContent className="flex items-start justify-between gap-3 p-3">
          <div className="min-w-0">
            <div className="truncate font-medium">{loan.loanName}</div>
            <div className="text-xs text-muted-foreground">
              {loan.loanNumber} · {loan.lenderName}
            </div>
            <div className="mt-1 text-sm tabular-nums">Outstanding {money(loan.outstandingPrincipal)}</div>
          </div>
          <LoanStatusBadge status={loan.status} />
        </CardContent>
      </Card>
    </button>
  );
}
