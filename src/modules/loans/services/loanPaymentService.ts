import type { Company } from "@/hooks/useCompany";
import type { Loan } from "../types/loanTypes";
import type { LoanScheduleRow } from "../types/loanScheduleTypes";
import type { LoanPaymentInput, LoanTransaction } from "../types/loanTransactionTypes";
import {
  createAuditRow,
  getLoan,
  getScheduleRow,
  listTransactions,
  saveAudit,
  saveLoan,
  saveScheduleRows,
  saveTransaction,
} from "../db/loanRepository";
import { getCompanyDocFromBrowserDb } from "@/lib/localCompanyDocMirror";
import { newLoanDocId, nowIso } from "../db/loanIds";
import { remainingDue, computeScheduleStatus, daysOverdue } from "../utils/loanStatus";
import { roundMoney } from "../utils/loanRounding";
import { todayIso } from "../utils/loanDateUtils";
import { emiLines, postLoanJournal, postReversalJournal, resolveLoanJournalAttachments, type JournalLine } from "./loanAccountingService";
import { calculateLateFee } from "./loanInterestService";

function splitPayment(row: LoanScheduleRow, amount: number, lateFee: number): {
  lateFee: number;
  interest: number;
  principal: number;
} {
  let rest = roundMoney(amount);
  const late = roundMoney(Math.min(lateFee, rest));
  rest = roundMoney(rest - late);
  const interestRemaining = roundMoney(Math.max(0, row.interestDue - row.interestPaid));
  const interest = roundMoney(Math.min(interestRemaining, rest));
  rest = roundMoney(rest - interest);
  const principalRemaining = roundMoney(Math.max(0, row.principalDue - row.principalPaid));
  const principal = roundMoney(Math.min(principalRemaining, rest));
  return { lateFee: late, interest, principal };
}

export async function postEmiPayment(params: {
  companyId: string;
  userId: string;
  userName: string;
  company: Company | null;
  loanId: string;
  input: LoanPaymentInput;
}): Promise<{ loan: Loan; schedule: LoanScheduleRow }> {
  const loan = await getLoan(params.companyId, params.loanId);
  if (!loan) throw new Error("Loan not found.");
  if (loan.status === "closed" || loan.status === "cancelled") throw new Error("Cannot post payment on a closed loan.");
  if (loan.status === "draft" || !loan.disbursementJournalId) {
    throw new Error("Post disbursement first. Draft loans cannot pay EMI.");
  }
  const row = await getScheduleRow(params.companyId, params.input.scheduleId);
  if (!row || row.loanId !== loan.id) throw new Error("Installment not found.");
  if (row.isHistorical || row.status === "cancelled" || row.status === "waived") {
    throw new Error("This installment cannot be paid.");
  }
  if (row.status === "paid") throw new Error("This installment is already paid.");

  const due = remainingDue(row);
  if (!(params.input.amount > 0)) throw new Error("Payment amount must be greater than 0.");
  if (params.input.amount > due + 0.0001) {
    throw new Error("Payment is greater than amount due. Use Prepayment for extra principal.");
  }

  const overdueDays = daysOverdue(row.dueDate, loan.gracePeriodDays, params.input.paymentDate);
  const computedLate = params.input.includeLateFee === false ? 0 : calculateLateFee(loan, due, overdueDays);
  const lateFee = loan.autoPostLateFee ? computedLate : params.input.includeLateFee ? computedLate : 0;
  const split = splitPayment(row, params.input.amount, lateFee);
  const journalAmount = roundMoney(split.principal + split.interest + split.lateFee);
  if (journalAmount <= 0) throw new Error("Nothing to post.");

  const attachments = await resolveLoanJournalAttachments({
    companyId: params.companyId,
    companyPlanId: params.company?.planId,
    companyStorageOption: params.company?.storageOption,
    attachmentFiles: params.input.attachmentFiles,
  });

  const journal = await postLoanJournal({
    companyId: params.companyId,
    userId: params.userId,
    companyDoc: params.company as unknown as Record<string, unknown>,
    dateIso: params.input.journalDate || params.input.paymentDate,
    narration: `EMI #${row.installmentNumber} — ${loan.loanName} (${loan.loanNumber})`,
    lines: emiLines({
      loanAccountId: loan.loanAccountId,
      interestExpenseAccountId: loan.interestExpenseAccountId,
      bankAccountId: params.input.bankAccountId || loan.bankAccountId,
      principal: split.principal,
      interest: split.interest,
      lateFee: split.lateFee,
      lateFeeAccountId: loan.lateFeeAccountId,
    }),
    loanId: loan.id,
    loanScheduleId: row.id,
    loanTransactionKind: split.principal + split.interest < due ? "partial_payment" : "emi",
    approve: true,
    referenceNumber: params.input.referenceNumber,
    voucherNumber: params.input.voucherNumber,
    journalSubType: "pay_emi",
    fileUrls: attachments.fileUrls,
    preGeneratedVoucherId: attachments.preGeneratedVoucherId,
  });

  const nextRow: LoanScheduleRow = {
    ...row,
    principalPaid: roundMoney(row.principalPaid + split.principal),
    interestPaid: roundMoney(row.interestPaid + split.interest),
    lateFee: roundMoney(row.lateFee + split.lateFee),
    totalPaid: roundMoney(row.totalPaid + journalAmount),
    paymentDate: params.input.paymentDate,
    journalEntryId: journal.id,
    updatedAt: nowIso(),
  };
  nextRow.status = computeScheduleStatus(nextRow, loan.gracePeriodDays, params.input.paymentDate);

  const nextLoan: Loan = {
    ...loan,
    outstandingPrincipal: roundMoney(Math.max(0, loan.outstandingPrincipal - split.principal)),
    paidPrincipal: roundMoney(loan.paidPrincipal + split.principal),
    paidInterest: roundMoney(loan.paidInterest + split.interest),
    paidCharges: roundMoney(loan.paidCharges + split.lateFee),
    updatedAt: nowIso(),
    updatedBy: params.userId,
  };

  await saveScheduleRows(params.companyId, [nextRow]);
  await saveLoan(nextLoan);
  await saveTransaction({
    id: newLoanDocId("txn"),
    companyId: params.companyId,
    loanId: loan.id,
    scheduleId: row.id,
    kind: nextRow.status === "paid" ? "emi" : "partial_payment",
    amount: journalAmount,
    principalAmount: split.principal,
    interestAmount: split.interest,
    chargeAmount: 0,
    lateFeeAmount: split.lateFee,
    paymentDate: params.input.paymentDate,
    journalDate: params.input.journalDate || params.input.paymentDate,
    dueDate: row.dueDate,
    bankAccountId: params.input.bankAccountId || loan.bankAccountId,
    journalEntryId: journal.id,
    reversedTransactionId: null,
    reversalJournalId: null,
    referenceNumber: params.input.referenceNumber || journal.voucherNumber,
    chequeNumber: params.input.chequeNumber || "",
    bankTransactionId: params.input.bankTransactionId || "",
    paymentMode: params.input.paymentMode || "bank",
    notes: params.input.notes || "",
    createdAt: nowIso(),
    createdBy: params.userId,
    isReversed: false,
  });
  await saveAudit(
    createAuditRow({
      companyId: params.companyId,
      loanId: loan.id,
      action: nextRow.status === "paid" ? "emi_posted" : "partial_payment",
      userId: params.userId,
      userName: params.userName,
      oldValue: { scheduleId: row.id, status: row.status, remaining: due },
      newValue: { journalId: journal.id, paid: journalAmount, status: nextRow.status },
      reason: params.input.notes || "",
    })
  );
  return { loan: nextLoan, schedule: nextRow };
}

function voucherLines(voucher: Record<string, unknown> | null): JournalLine[] {
  const entries = Array.isArray(voucher?.entries) ? voucher!.entries : [];
  return (entries as Array<{ accountId?: string; debit?: number; credit?: number }>).map((e) => ({
    accountId: String(e.accountId || ""),
    debit: Number(e.debit) || 0,
    credit: Number(e.credit) || 0,
  }));
}

/**
 * Reverse the latest posted EMI / partial payment by posting an opposite journal.
 * The original voucher is kept.
 */
export async function reverseEmiPayment(params: {
  companyId: string;
  userId: string;
  userName: string;
  company: Company | null;
  loanId: string;
  transactionId: string;
}): Promise<Loan> {
  const loan = await getLoan(params.companyId, params.loanId);
  if (!loan) throw new Error("Loan not found.");
  if (loan.status === "closed" || loan.status === "cancelled") {
    throw new Error("Cannot reverse payment on a closed loan. Reopen first.");
  }
  const txns = await listTransactions(params.companyId, loan.id);
  const target = txns.find((t) => t.id === params.transactionId);
  if (!target || target.loanId !== loan.id) throw new Error("Payment not found.");
  if (target.isReversed) throw new Error("This payment is already reversed.");
  if (target.kind !== "emi" && target.kind !== "partial_payment") {
    throw new Error("Only EMI / partial payments can be reversed here.");
  }
  const latestPayable = txns.find((t) => !t.isReversed && (t.kind === "emi" || t.kind === "partial_payment"));
  if (!latestPayable || latestPayable.id !== target.id) {
    throw new Error("Reverse the most recent EMI / partial payment first.");
  }
  if (!target.journalEntryId) throw new Error("This payment has no journal to reverse.");

  const voucher = (await getCompanyDocFromBrowserDb(params.companyId, "vouchers", target.journalEntryId)) as Record<
    string,
    unknown
  > | null;
  const lines = voucherLines(voucher);
  if (!lines.length) throw new Error("Original journal entries were not found. Cannot reverse.");

  const reversal = await postReversalJournal({
    companyId: params.companyId,
    userId: params.userId,
    companyDoc: params.company as unknown as Record<string, unknown>,
    dateIso: todayIso(),
    originalLines: lines,
    originalVoucherId: target.journalEntryId,
    originalVoucherNumber: String(voucher?.voucherNumber || target.referenceNumber || ""),
    loanId: loan.id,
    narration: `Reversal of EMI # payment — ${loan.loanName} (${loan.loanNumber})`,
    approve: true,
  });

  if (target.scheduleId) {
    const row = await getScheduleRow(params.companyId, target.scheduleId);
    if (row) {
      const nextPaid = roundMoney(Math.max(0, row.totalPaid - target.amount));
      const nextRow: LoanScheduleRow = {
        ...row,
        principalPaid: roundMoney(Math.max(0, row.principalPaid - target.principalAmount)),
        interestPaid: roundMoney(Math.max(0, row.interestPaid - target.interestAmount)),
        lateFee: roundMoney(Math.max(0, row.lateFee - target.lateFeeAmount)),
        totalPaid: nextPaid,
        paymentDate: nextPaid > 0 ? row.paymentDate : null,
        journalEntryId: nextPaid > 0 ? row.journalEntryId : null,
        updatedAt: nowIso(),
      };
      nextRow.status = computeScheduleStatus(nextRow, loan.gracePeriodDays);
      await saveScheduleRows(params.companyId, [nextRow]);
    }
  }

  const nextLoan: Loan = {
    ...loan,
    outstandingPrincipal: roundMoney(loan.outstandingPrincipal + target.principalAmount),
    paidPrincipal: roundMoney(Math.max(0, loan.paidPrincipal - target.principalAmount)),
    paidInterest: roundMoney(Math.max(0, loan.paidInterest - target.interestAmount)),
    paidCharges: roundMoney(Math.max(0, loan.paidCharges - target.lateFeeAmount)),
    updatedAt: nowIso(),
    updatedBy: params.userId,
    status: loan.status,
  };
  await saveLoan(nextLoan);

  const reversed: LoanTransaction = {
    ...target,
    isReversed: true,
    reversalJournalId: reversal.id,
  };
  await saveTransaction(reversed);
  await saveTransaction({
    id: newLoanDocId("txn"),
    companyId: params.companyId,
    loanId: loan.id,
    scheduleId: target.scheduleId,
    kind: "reversal",
    amount: target.amount,
    principalAmount: target.principalAmount,
    interestAmount: target.interestAmount,
    chargeAmount: 0,
    lateFeeAmount: target.lateFeeAmount,
    paymentDate: todayIso(),
    journalDate: todayIso(),
    dueDate: target.dueDate,
    bankAccountId: target.bankAccountId,
    journalEntryId: reversal.id,
    reversedTransactionId: target.id,
    reversalJournalId: reversal.id,
    referenceNumber: reversal.voucherNumber,
    chequeNumber: "",
    bankTransactionId: "",
    paymentMode: target.paymentMode,
    notes: `Reverses ${target.referenceNumber || target.id}`,
    createdAt: nowIso(),
    createdBy: params.userId,
    isReversed: false,
  });
  await saveAudit(
    createAuditRow({
      companyId: params.companyId,
      loanId: loan.id,
      action: "emi_reversed",
      userId: params.userId,
      userName: params.userName,
      oldValue: { transactionId: target.id, journalId: target.journalEntryId, amount: target.amount },
      newValue: { reversalJournalId: reversal.id },
      reason: "EMI reversal — original voucher kept",
    })
  );
  return nextLoan;
}
