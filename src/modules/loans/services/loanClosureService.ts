import type { Loan } from "../types/loanTypes";
import { roundMoney } from "../utils/loanRounding";
import {
  createAuditRow,
  getLoan,
  listCharges,
  listSchedules,
  saveAudit,
  saveLoan,
} from "../db/loanRepository";
import { currentSchedule } from "../db/loanQueries";
import { remainingDue } from "../utils/loanStatus";
import { nowIso } from "../db/loanIds";

export async function closeLoan(params: {
  companyId: string;
  userId: string;
  userName: string;
  loanId: string;
  reason: string;
  force?: boolean;
}): Promise<Loan> {
  const loan = await getLoan(params.companyId, params.loanId);
  if (!loan) throw new Error("Loan not found.");
  if (loan.status === "closed") throw new Error("Loan is already closed.");
  const rows = currentSchedule(await listSchedules(params.companyId, loan.id));
  const openInstallments = rows.filter((r) => remainingDue(r) > 0);
  const charges = await listCharges(params.companyId, loan.id);
  const unsettledCharges = charges.filter((c) => !c.journalEntryId);
  if (!params.force) {
    if (roundMoney(loan.outstandingPrincipal) > 0) throw new Error("Outstanding principal must be 0 to close.");
    if (roundMoney(loan.outstandingInterest) > 0) throw new Error("Outstanding interest must be 0 to close.");
    if (openInstallments.length) throw new Error("Settle remaining installments before closing.");
    if (unsettledCharges.length) throw new Error("Settle remaining charges before closing.");
  }
  const next: Loan = {
    ...loan,
    status: "closed",
    closedAt: nowIso(),
    updatedAt: nowIso(),
    updatedBy: params.userId,
  };
  await saveLoan(next);
  await saveAudit(
    createAuditRow({
      companyId: params.companyId,
      loanId: loan.id,
      action: "loan_closed",
      userId: params.userId,
      userName: params.userName,
      oldValue: { status: loan.status, outstanding: loan.outstandingPrincipal },
      newValue: { status: "closed" },
      reason: params.reason || (params.force ? "Manual close" : ""),
    })
  );
  return next;
}

export async function reopenLoan(params: {
  companyId: string;
  userId: string;
  userName: string;
  loanId: string;
  reason: string;
}): Promise<Loan> {
  const loan = await getLoan(params.companyId, params.loanId);
  if (!loan) throw new Error("Loan not found.");
  if (loan.status !== "closed") throw new Error("Only a closed loan can be reopened.");
  const next: Loan = {
    ...loan,
    status: loan.outstandingPrincipal > 0 ? "active" : "active",
    closedAt: null,
    updatedAt: nowIso(),
    updatedBy: params.userId,
  };
  await saveLoan(next);
  await saveAudit(
    createAuditRow({
      companyId: params.companyId,
      loanId: loan.id,
      action: "loan_reopened",
      userId: params.userId,
      userName: params.userName,
      oldValue: { status: "closed" },
      newValue: { status: next.status },
      reason: params.reason,
    })
  );
  return next;
}
