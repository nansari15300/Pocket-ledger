"use client";

import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { LoadingSpinner } from "@/components/layout/LoadingSpinner";
import { LoanDetails } from "./LoanDetails";
import { useLoan } from "../hooks/useLoan";
import { postEmiPayment, reverseEmiPayment } from "../services/loanPaymentService";
import { postPrepayment } from "../services/loanPrepaymentService";
import { changeInterestRate } from "../services/loanRateChangeImpl";
import { addLoanCharge } from "../services/loanChargePostingService";
import { closeLoan, reopenLoan } from "../services/loanClosureService";
import { updateLoan } from "../services/loanService";
import type { LoanDraftInput } from "../types/loanTypes";

export function LoanWorkspaceDetails({
  loanId,
  onReloadList,
}: {
  loanId: string;
  onReloadList?: () => Promise<void> | void;
}) {
  const { company, companyId } = useCompany();
  const { user } = useAuth();
  const detail = useLoan(companyId, loanId);
  const userName = user?.displayName || user?.email || user?.uid || "user";

  if (!companyId) {
    return <p className="p-4 text-sm text-muted-foreground">Select a company to manage loans.</p>;
  }
  if (detail.loading && !detail.loan) return <LoadingSpinner />;
  if (!detail.loan) {
    return <p className="p-4 text-sm text-muted-foreground">Loan not found.</p>;
  }

  return (
    <LoanDetails
      loan={detail.loan}
      schedule={detail.schedule}
      transactions={detail.transactions}
      charges={detail.charges}
      rateHistory={detail.rateHistory}
      audit={detail.audit}
      documents={detail.documents}
      onPay={async (input) => {
        try {
          await postEmiPayment({
            companyId,
            userId: user?.uid || "user",
            userName,
            company,
            loanId,
            input,
          });
          toast.success("Payment posted.");
          await detail.reload();
          await onReloadList?.();
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Payment failed");
          throw e;
        }
      }}
      onPrepay={async (input) => {
        try {
          await postPrepayment({
            companyId,
            userId: user?.uid || "user",
            userName,
            company,
            loanId,
            input,
          });
          toast.success("Prepayment posted.");
          await detail.reload();
          await onReloadList?.();
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Prepayment failed");
          throw e;
        }
      }}
      onRateChange={async (input) => {
        try {
          await changeInterestRate({
            companyId,
            userId: user?.uid || "user",
            userName,
            loanId,
            input,
          });
          toast.success("Rate updated. Future schedule recalculated.");
          await detail.reload();
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Rate change failed");
          throw e;
        }
      }}
      onCharge={async (input) => {
        try {
          await addLoanCharge({
            companyId,
            userId: user?.uid || "user",
            userName,
            company,
            loanId,
            input,
          });
          toast.success("Charge posted.");
          await detail.reload();
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Charge failed");
          throw e;
        }
      }}
      onClose={async (reason, force) => {
        try {
          await closeLoan({
            companyId,
            userId: user?.uid || "user",
            userName,
            loanId,
            reason,
            force,
          });
          toast.success("Loan closed.");
          await detail.reload();
          await onReloadList?.();
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Close failed");
          throw e;
        }
      }}
      onReopen={async (reason) => {
        try {
          await reopenLoan({
            companyId,
            userId: user?.uid || "user",
            userName,
            loanId,
            reason,
          });
          toast.success("Loan reopened.");
          await detail.reload();
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Reopen failed");
        }
      }}
      onReversePayment={async (transactionId) => {
        try {
          await reverseEmiPayment({
            companyId,
            userId: user?.uid || "user",
            userName,
            company,
            loanId,
            transactionId,
          });
          toast.success("EMI reversed. Original voucher was kept; a reversing journal was posted.");
          await detail.reload();
          await onReloadList?.();
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Reversal failed");
        }
      }}
      onSaveEdit={async (input: LoanDraftInput) => {
        try {
          await updateLoan({
            companyId,
            loanId,
            userId: user?.uid || "user",
            userName,
            company,
            input,
          });
          toast.success("Loan updated.");
          await detail.reload();
          await onReloadList?.();
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Update failed");
          throw e;
        }
      }}
      onLoanUpdated={() => detail.reload()}
    />
  );
}
