"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { LoadingSpinner } from "@/components/layout/LoadingSpinner";
import { currentSchedule, findLoanForAccount } from "../db/loanQueries";
import { useLoans } from "../hooks/useLoans";
import { postEmiPayment } from "../services/loanPaymentService";
import type { Loan } from "../types/loanTypes";
import type { LoanScheduleRow } from "../types/loanScheduleTypes";
import { isLoanPostingAllowed, pickNextPayEmiRow } from "../utils/staffPayEmiState";
import { LoanPaymentDialog } from "./LoanPaymentDialog";

type LoanPayCandidate = { loan: Loan; row: LoanScheduleRow };

export function StaffPayEmiFlow({
  open,
  onOpenChange,
  preferredAccountId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preferredAccountId?: string | null;
}) {
  const { company, companyId } = useCompany();
  const { user } = useAuth();
  const { allLoans, schedulesByLoan, loading, reload } = useLoans(companyId);
  const userName = user?.displayName || user?.email || user?.uid || "user";

  const [pickerOpen, setPickerOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [candidates, setCandidates] = useState<LoanPayCandidate[]>([]);
  const [activeLoan, setActiveLoan] = useState<Loan | null>(null);
  const [activeRow, setActiveRow] = useState<LoanScheduleRow | null>(null);

  const reset = useCallback(() => {
    setPickerOpen(false);
    setPaymentOpen(false);
    setCandidates([]);
    setActiveLoan(null);
    setActiveRow(null);
  }, []);

  const payableCandidates = useMemo(() => {
    const accountId = String(preferredAccountId || "").trim();
    let loans: Loan[] = [];

    if (accountId) {
      const linked = findLoanForAccount(allLoans, accountId);
      if (linked) loans = [linked];
    } else {
      loans = allLoans.filter(isLoanPostingAllowed);
    }

    return loans
      .filter(isLoanPostingAllowed)
      .map((loan) => ({ loan, row: pickNextPayEmiRow(loan, schedulesByLoan[loan.id] || []) }))
      .filter((entry): entry is LoanPayCandidate => !!entry.row);
  }, [allLoans, preferredAccountId, schedulesByLoan]);

  useEffect(() => {
    if (!open) {
      reset();
      return;
    }
    if (loading) return;

    const accountId = String(preferredAccountId || "").trim();
    if (accountId) {
      const linked = findLoanForAccount(allLoans, accountId);
      if (!linked) {
        toast.error("No loan linked to this account.");
        onOpenChange(false);
        return;
      }
      if (!isLoanPostingAllowed(linked)) {
        toast.error("This loan is not ready for EMI payments yet.");
        onOpenChange(false);
        return;
      }
    }

    if (payableCandidates.length === 0) {
      toast.error(accountId ? "No EMI due for this loan." : "No loan with EMI due found.");
      onOpenChange(false);
      return;
    }

    if (payableCandidates.length === 1) {
      setActiveLoan(payableCandidates[0].loan);
      setActiveRow(payableCandidates[0].row);
      setPaymentOpen(true);
      return;
    }

    setCandidates(payableCandidates);
    setPickerOpen(true);
  }, [open, loading, preferredAccountId, allLoans, payableCandidates, onOpenChange, reset]);

  const handlePickerClose = (next: boolean) => {
    setPickerOpen(next);
    if (!next) onOpenChange(false);
  };

  const handlePaymentClose = (next: boolean) => {
    setPaymentOpen(next);
    if (!next) onOpenChange(false);
  };

  const handlePick = (entry: LoanPayCandidate) => {
    setActiveLoan(entry.loan);
    setActiveRow(entry.row);
    setPickerOpen(false);
    setPaymentOpen(true);
  };

  return (
    <>
      <Dialog open={pickerOpen} onOpenChange={handlePickerClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Select loan for EMI</DialogTitle>
          </DialogHeader>
          {loading ? (
            <LoadingSpinner />
          ) : (
            <div className="flex max-h-[min(60vh,24rem)] flex-col gap-2 overflow-y-auto">
              {candidates.map(({ loan, row }) => (
                <Button
                  key={loan.id}
                  type="button"
                  variant="outline"
                  className="h-auto justify-start px-3 py-2 text-left"
                  onClick={() => handlePick({ loan, row })}
                >
                  <span className="block font-medium">{loan.loanName || loan.lenderName}</span>
                  <span className="block text-xs text-muted-foreground">
                    {loan.loanNumber ? `#${loan.loanNumber}` : loan.id}
                    {row.installmentNumber ? ` · EMI ${row.installmentNumber}` : ""}
                  </span>
                </Button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <LoanPaymentDialog
        open={paymentOpen}
        onOpenChange={handlePaymentClose}
        loan={activeLoan}
        row={activeRow}
        onSubmit={async (input) => {
          if (!companyId || !activeLoan) return;
          try {
            await postEmiPayment({
              companyId,
              userId: user?.uid || "user",
              userName,
              company,
              loanId: activeLoan.id,
              input,
            });
            toast.success("Payment posted.");
            await reload();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Payment failed");
            throw e;
          }
        }}
        onLoanUpdated={() => void reload()}
      />
    </>
  );
}
