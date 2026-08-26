"use client";

import { LoanCard } from "./LoanCard";
import type { Loan } from "../types/loanTypes";

export function LoanList({
  loans,
  selectedId,
  onSelect,
}: {
  loans: Loan[];
  selectedId?: string | null;
  onSelect: (loan: Loan) => void;
}) {
  if (loans.length === 0) {
    return <p className="px-1 py-8 text-center text-sm text-muted-foreground">No loans yet. Create a loan account to start.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      {loans.map((loan) => (
        <LoanCard key={loan.id} loan={loan} selected={loan.id === selectedId} onClick={() => onSelect(loan)} />
      ))}
    </div>
  );
}
