import { getCompanyDocFromBrowserDb } from "@/lib/localCompanyDocMirror";
import type { Loan } from "../types/loanTypes";
import type { LoanScheduleRow } from "../types/loanScheduleTypes";
import type { LoanTransaction } from "../types/loanTransactionTypes";
import {
  createAuditRow,
  deleteCharge,
  deleteTransaction,
  getLoan,
  listCharges,
  listSchedules,
  listTransactions,
  saveAudit,
  saveLoan,
  saveScheduleRows,
} from "../db/loanRepository";
import { nowIso } from "../db/loanIds";
import { compareLoanTxnChronological } from "../utils/loanLedgerMovement";
import { roundMoney } from "../utils/loanRounding";
import { computeScheduleStatus } from "../utils/loanStatus";

async function journalIsLive(companyId: string, journalId: string): Promise<boolean> {
  const id = String(journalId || "").trim();
  if (!id) return false;
  const voucher = (await getCompanyDocFromBrowserDb(companyId, "vouchers", id)) as { isDeleted?: boolean } | null;
  return Boolean(voucher) && voucher?.isDeleted !== true;
}

function recomputeLoanFromTransactions(loan: Loan, kept: LoanTransaction[], userId: string): Loan {
  const live = kept.filter((t) => !t.isReversed);
  const disbursements = live
    .filter((t) => t.kind === "disbursement")
    .slice()
    .sort(compareLoanTxnChronological);
  const payments = live.filter(
    (t) => t.kind === "emi" || t.kind === "partial_payment" || t.kind === "prepayment"
  );
  const chargeRows = live.filter((t) => t.kind === "charge" || t.kind === "late_fee");
  const disbursedAmount = roundMoney(
    disbursements.reduce((sum, t) => sum + Number(t.principalAmount || t.amount || 0), 0)
  );
  const paidPrincipal = roundMoney(payments.reduce((sum, t) => sum + Number(t.principalAmount || 0), 0));
  const paidInterest = roundMoney(payments.reduce((sum, t) => sum + Number(t.interestAmount || 0), 0));
  const paidCharges = roundMoney(
    payments.reduce((sum, t) => sum + Number(t.lateFeeAmount || 0), 0) +
      chargeRows.reduce((sum, t) => sum + Number(t.chargeAmount || 0) + Number(t.lateFeeAmount || 0), 0)
  );
  const firstJournal = String(disbursements[0]?.journalEntryId || "").trim() || null;
  const currentJournal = String(loan.disbursementJournalId || "").trim();
  const liveJournalIds = new Set(disbursements.map((t) => String(t.journalEntryId || "")).filter(Boolean));
  const disbursementJournalId = currentJournal && liveJournalIds.has(currentJournal) ? currentJournal : firstJournal;
  return {
    ...loan,
    disbursedAmount,
    outstandingPrincipal: roundMoney(Math.max(0, disbursedAmount - paidPrincipal)),
    paidPrincipal,
    paidInterest,
    paidCharges,
    disbursementJournalId,
    updatedAt: nowIso(),
    updatedBy: userId || loan.updatedBy,
  };
}

function unwindScheduleForOrphan(
  row: LoanScheduleRow,
  orphan: LoanTransaction,
  gracePeriodDays: number
): LoanScheduleRow {
  const nextPaid = roundMoney(Math.max(0, row.totalPaid - Number(orphan.amount || 0)));
  const sameJournal = String(row.journalEntryId || "") === String(orphan.journalEntryId || "");
  const next: LoanScheduleRow = {
    ...row,
    principalPaid: roundMoney(Math.max(0, row.principalPaid - Number(orphan.principalAmount || 0))),
    interestPaid: roundMoney(Math.max(0, row.interestPaid - Number(orphan.interestAmount || 0))),
    lateFee: roundMoney(Math.max(0, row.lateFee - Number(orphan.lateFeeAmount || 0))),
    totalPaid: nextPaid,
    paymentDate: nextPaid > 0 ? row.paymentDate : null,
    journalEntryId: sameJournal && nextPaid <= 0 ? null : row.journalEntryId,
    updatedAt: nowIso(),
  };
  next.status = computeScheduleStatus(next, gracePeriodDays);
  return next;
}

/**
 * Journal voucher recycle-bin / delete ke baad leftover loan_transactions hatao
 * (warna Accounting row dikhti hai, double-click edit nahi khulta).
 */
export async function reconcileLoanTransactionsToLiveJournals(params: {
  companyId: string;
  loanId: string;
  userId?: string;
}): Promise<{ changed: boolean; transactions: LoanTransaction[]; loan: Loan | null }> {
  const companyId = String(params.companyId || "").trim();
  const loanId = String(params.loanId || "").trim();
  const userId = String(params.userId || "").trim();
  const loan = await getLoan(companyId, loanId);
  const txns = await listTransactions(companyId, loanId);
  if (!loan) return { changed: false, transactions: txns, loan: null };

  const orphans: LoanTransaction[] = [];
  const kept: LoanTransaction[] = [];
  for (const txn of txns) {
    const journalId = String(txn.journalEntryId || "").trim();
    if (!journalId) {
      kept.push(txn);
      continue;
    }
    if (await journalIsLive(companyId, journalId)) {
      kept.push(txn);
    } else {
      orphans.push(txn);
    }
  }

  const charges = await listCharges(companyId, loanId);
  const deadCharges: typeof charges = [];
  for (const charge of charges) {
    const journalId = String(charge.journalEntryId || "").trim();
    if (!journalId) continue;
    if (!(await journalIsLive(companyId, journalId))) deadCharges.push(charge);
  }

  if (!orphans.length && !deadCharges.length) {
    return { changed: false, transactions: txns, loan };
  }

  const schedule = await listSchedules(companyId, loanId);
  const scheduleById = new Map(schedule.map((row) => [row.id, row]));
  const touchedSchedule = new Map<string, LoanScheduleRow>();
  for (const orphan of orphans) {
    const scheduleId = String(orphan.scheduleId || "").trim();
    if (!scheduleId) continue;
    if (orphan.kind !== "emi" && orphan.kind !== "partial_payment" && orphan.kind !== "prepayment") continue;
    const current = touchedSchedule.get(scheduleId) || scheduleById.get(scheduleId);
    if (!current) continue;
    touchedSchedule.set(scheduleId, unwindScheduleForOrphan(current, orphan, loan.gracePeriodDays));
  }
  if (touchedSchedule.size) {
    await saveScheduleRows(companyId, [...touchedSchedule.values()]);
  }

  for (const orphan of orphans) {
    await deleteTransaction(companyId, orphan.id);
  }
  for (const charge of deadCharges) {
    await deleteCharge(companyId, charge.id);
  }

  const nextLoan = recomputeLoanFromTransactions(loan, kept, userId);
  await saveLoan(nextLoan);
  await saveAudit(
    createAuditRow({
      companyId,
      loanId,
      action: "loan_updated",
      userId: userId || loan.updatedBy,
      userName: "",
      oldValue: {
        journalIds: orphans.map((t) => t.journalEntryId),
        disbursedAmount: loan.disbursedAmount,
      },
      newValue: {
        disbursedAmount: nextLoan.disbursedAmount,
        outstandingPrincipal: nextLoan.outstandingPrincipal,
      },
      reason: "Removed loan rows whose journal was deleted",
    })
  );

  return { changed: true, transactions: kept, loan: nextLoan };
}
