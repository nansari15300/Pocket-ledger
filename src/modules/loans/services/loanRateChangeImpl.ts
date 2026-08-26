import type { Company } from "@/hooks/useCompany";
import type { LoanRateChangeInput } from "../types/loanTransactionTypes";
import {
  createAuditRow,
  getLoan,
  listSchedules,
  saveAudit,
  saveLoan,
  saveRateHistory,
  saveScheduleRows,
} from "../db/loanRepository";
import { currentSchedule } from "../db/loanQueries";
import { newLoanDocId, nowIso } from "../db/loanIds";
import { markHistorical, materializeSchedule, regenerateFutureSchedule, refreshScheduleStatuses } from "./loanScheduleService";
import type { Loan } from "../types/loanTypes";

export async function changeInterestRate(params: {
  companyId: string;
  userId: string;
  userName: string;
  company?: Company | null;
  loanId: string;
  input: LoanRateChangeInput;
}): Promise<Loan> {
  const loan = await getLoan(params.companyId, params.loanId);
  if (!loan) throw new Error("Loan not found.");
  if (loan.status === "closed" || loan.status === "cancelled") throw new Error("Cannot change rate on a closed loan.");
  if (params.input.newRate < 0) throw new Error("Interest rate cannot be negative.");

  const allRows = await listSchedules(params.companyId, loan.id);
  const live = currentSchedule(allRows);
  const unpaidFuture = live.filter((r) => r.status !== "paid" && r.status !== "partially_paid" && !r.isHistorical);
  const firstFuture = unpaidFuture.find((r) => r.dueDate >= params.input.effectiveDate) || unpaidFuture[0];
  if (!firstFuture) throw new Error("No future installments to recalculate.");

  const historical = markHistorical(unpaidFuture.filter((r) => r.dueDate >= params.input.effectiveDate));
  const remainingCount = historical.length;
  const generated = regenerateFutureSchedule({
    loan,
    paidRows: live.filter((r) => r.status === "paid" || r.status === "partially_paid"),
    outstandingPrincipal: loan.outstandingPrincipal,
    interestRate: params.input.newRate,
    remainingCount,
    firstFutureDate: firstFuture.dueDate,
    emiAmount: loan.emiIsManual ? loan.emiAmount : undefined,
    emiIsManual: loan.emiIsManual,
  });

  const nextLoan: Loan = {
    ...loan,
    interestRate: params.input.newRate,
    scheduleVersion: loan.scheduleVersion + 1,
    maturityDate: generated[generated.length - 1]?.dueDate || loan.maturityDate,
    updatedAt: nowIso(),
    updatedBy: params.userId,
  };
  const newRows = refreshScheduleStatuses(nextLoan, materializeSchedule(params.companyId, loan.id, generated));
  await saveScheduleRows(params.companyId, [...historical, ...newRows]);
  await saveLoan(nextLoan);
  await saveRateHistory({
    id: newLoanDocId("rate"),
    companyId: params.companyId,
    loanId: loan.id,
    effectiveDate: params.input.effectiveDate,
    oldRate: loan.interestRate,
    newRate: params.input.newRate,
    reason: params.input.reason || "",
    createdAt: nowIso(),
    createdBy: params.userId,
    userName: params.userName,
  });
  await saveAudit(
    createAuditRow({
      companyId: params.companyId,
      loanId: loan.id,
      action: "interest_rate_changed",
      userId: params.userId,
      userName: params.userName,
      oldValue: { rate: loan.interestRate, version: loan.scheduleVersion },
      newValue: { rate: params.input.newRate, version: nextLoan.scheduleVersion },
      reason: params.input.reason || "",
    })
  );
  return nextLoan;
}
