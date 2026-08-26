"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { LoanDashboardStats } from "../types/loanTypes";
import { useDate } from "@/hooks/useDate";

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent className="text-lg font-semibold tabular-nums">{value}</CardContent>
    </Card>
  );
}

export function LoanStats({ stats }: { stats: LoanDashboardStats }) {
  const { formatCurrencyForPrint } = useDate();
  const money = (n: number) => formatCurrencyForPrint(n, { noAnimation: true, noSuffix: true, showDrCr: false });
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Stat label="Active Loans" value={stats.activeLoans} />
      <Stat label="Total Borrowed" value={money(stats.totalBorrowed)} />
      <Stat label="Outstanding" value={money(stats.outstanding)} />
      <Stat label="Principal Paid" value={money(stats.principalPaid)} />
      <Stat label="Interest Paid" value={money(stats.interestPaid)} />
      <Stat label="Upcoming EMI" value={money(stats.upcomingEmi)} />
      <Stat label="Overdue" value={money(stats.overdueAmount)} />
      <Stat label="Overdue Installments" value={stats.overdueInstallments} />
    </div>
  );
}
