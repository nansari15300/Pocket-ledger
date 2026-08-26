"use client";

import { LoanStats } from "./LoanStats";
import { LoanFilters, type LoanFilterState } from "./LoanFilters";
import { LoanList } from "./LoanList";
import type { Loan, LoanDashboardStats } from "../types/loanTypes";
import { Button } from "@/components/ui/button";
import { BTN_SAVE_CLASS } from "@/components/vouchers/voucherButtonStyles";

export function LoanDashboard({
  stats,
  loans,
  filters,
  onFiltersChange,
  selectedId,
  onSelect,
  onCreate,
  onReports,
}: {
  stats: LoanDashboardStats;
  loans: Loan[];
  filters: LoanFilterState;
  onFiltersChange: (next: LoanFilterState) => void;
  selectedId?: string | null;
  onSelect: (loan: Loan) => void;
  onCreate: () => void;
  onReports?: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Loan Overview</h1>
          <p className="text-sm text-muted-foreground">Manage bank loans, EMI schedule, and accounting entries.</p>
        </div>
        <div className="flex gap-2">
          {onReports ? (
            <Button type="button" variant="outline" onClick={onReports}>
              Reports
            </Button>
          ) : null}
          <Button type="button" className={BTN_SAVE_CLASS} onClick={onCreate}>
            Create Loan Account
          </Button>
        </div>
      </div>
      <LoanStats stats={stats} />
      <LoanFilters value={filters} onChange={onFiltersChange} />
      <LoanList loans={loans} selectedId={selectedId} onSelect={onSelect} />
    </div>
  );
}
