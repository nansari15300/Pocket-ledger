import type { Company } from "@/hooks/useCompany";
import { getCompanyDocFromBrowserDb } from "@/lib/localCompanyDocMirror";
import type { Loan } from "../types/loanTypes";
import type { LoanDisbursementInput } from "../types/loanTransactionTypes";
import {
  createAuditRow,
  getLoan,
  listSchedules,
  listTransactions,
  saveAudit,
  saveLoan,
  saveScheduleRows,
  saveTransaction,
} from "../db/loanRepository";
import { currentSchedule } from "../db/loanQueries";
import { newLoanDocId, nowIso } from "../db/loanIds";
import { roundMoney } from "../utils/loanRounding";
import { formatIsoDate, tryParseIsoDate } from "../utils/loanDateUtils";
import { remainingUndisbursedAmount } from "../utils/loanUndisbursed";
import { effectiveRepaymentType } from "../utils/loanRepaymentType";
import {
  markHistorical,
  materializeSchedule,
  regenerateFutureSchedule,
  refreshScheduleStatuses,
} from "./loanScheduleService";
import { buildScheduleAndPreview } from "./loanCalculationService";
import {
  disbursementLines,
  postLoanJournal,
  resolveLoanJournalAttachments,
  type JournalLine,
} from "./loanAccountingService";

type DisbursementJournalSnapshot = {
  id: string;
  voucherNumber: string;
  dateIso: string;
  narration: string;
  bankAccountId: string;
  amount: number;
};

function journalEntriesFromVoucher(voucher: Record<string, unknown>): JournalLine[] {
  const raw = Array.isArray(voucher.entries) ? voucher.entries : [];
  return raw
    .map((entry) => {
      const row = entry as Record<string, unknown>;
      return {
        accountId: String(row.accountId || "").trim(),
        debit: roundMoney(Number(row.debit || 0)),
        credit: roundMoney(Number(row.credit || 0)),
      };
    })
    .filter((line) => line.accountId && (line.debit > 0 || line.credit > 0));
}

function parseDisbursementJournalSnapshot(
  loan: Loan,
  voucher: Record<string, unknown>
): DisbursementJournalSnapshot {
  const journalId = String(voucher.id || "").trim();
  if (!journalId) throw new Error("Disbursement journal id is missing.");

  const entries = journalEntriesFromVoucher(voucher);
  const liabilityCredit = entries
    .filter((line) => line.accountId === loan.loanAccountId && line.credit > 0)
    .reduce((sum, line) => sum + line.credit, 0);
  const bankDebit = entries
    .filter((line) => line.accountId !== loan.loanAccountId && line.debit > 0)
    .reduce((sum, line) => sum + line.debit, 0);
  const amount = roundMoney(liabilityCredit > 0 ? liabilityCredit : bankDebit);
  if (!(amount > 0)) throw new Error("Journal must have Dr Bank / Cr Loan Liability with an amount greater than 0.");

  const bankAccountId =
    entries.find((line) => line.accountId !== loan.loanAccountId && line.debit > 0)?.accountId ||
    String(loan.bankAccountId || "").trim();
  if (!bankAccountId) throw new Error("Bank / cash account is required.");

  let dateIso = "";
  if (typeof voucher.date === "string") {
    const parsed = tryParseIsoDate(voucher.date);
    dateIso = parsed ? formatIsoDate(parsed) : voucher.date.slice(0, 10);
  } else if (voucher.date && typeof (voucher.date as { toDate?: () => Date }).toDate === "function") {
    dateIso = formatIsoDate((voucher.date as { toDate: () => Date }).toDate());
  } else {
    const parsed = tryParseIsoDate(String(voucher.date || ""));
    dateIso = parsed ? formatIsoDate(parsed) : formatIsoDate(new Date());
  }

  return {
    id: journalId,
    voucherNumber: String(voucher.voucherNumber || "").trim(),
    dateIso,
    narration: String(voucher.narration || "").trim(),
    bankAccountId,
    amount,
  };
}

async function applyLoanDisbursementRecord(params: {
  companyId: string;
  userId: string;
  userName: string;
  loan: Loan;
  journal: DisbursementJournalSnapshot;
  reason?: string;
}): Promise<Loan> {
  const { loan, journal } = params;
  const amount = roundMoney(journal.amount);
  const remaining = remainingUndisbursedAmount(loan);
  if (amount > remaining + 0.009) {
    throw new Error(
      remaining > 0
        ? `Amount cannot exceed remaining sanctioned (${remaining}).`
        : "Sanctioned amount is fully disbursed. Edit Sanctioned Amount if the bank increased the limit."
    );
  }

  const existing = (await listTransactions(params.companyId, loan.id)).find(
    (txn) => String(txn.journalEntryId || "") === journal.id && txn.kind === "disbursement"
  );
  if (existing) return loan;

  const notes =
    journal.narration.trim() || `Loan disbursement — ${loan.loanName} (${loan.loanNumber})`;

  await saveTransaction({
    id: newLoanDocId("txn"),
    companyId: params.companyId,
    loanId: loan.id,
    scheduleId: null,
    kind: "disbursement",
    amount,
    principalAmount: amount,
    interestAmount: 0,
    chargeAmount: 0,
    lateFeeAmount: 0,
    paymentDate: journal.dateIso,
    journalDate: journal.dateIso,
    dueDate: null,
    bankAccountId: journal.bankAccountId,
    journalEntryId: journal.id,
    reversedTransactionId: null,
    reversalJournalId: null,
    referenceNumber: journal.voucherNumber,
    chequeNumber: "",
    bankTransactionId: "",
    paymentMode: "bank",
    notes,
    createdAt: nowIso(),
    createdBy: params.userId,
    isReversed: false,
  });

  const nextDisbursed = roundMoney(loan.disbursedAmount + amount);
  const nextOutstanding = roundMoney(loan.outstandingPrincipal + amount);
  let next: Loan = {
    ...loan,
    disbursedAmount: nextDisbursed,
    outstandingPrincipal: nextOutstanding,
    scheduleVersion: loan.scheduleVersion + 1,
    updatedAt: nowIso(),
    updatedBy: params.userId,
  };

  const oldRows = await listSchedules(params.companyId, loan.id);
  const live = currentSchedule(oldRows);
  const paidRows = live.filter((row) => row.status === "paid" || row.status === "partially_paid");
  const unpaidFuture = live.filter((row) => row.status !== "paid" && row.status !== "partially_paid" && !row.isHistorical);

  if (!paidRows.length) {
    const { schedule: generated, preview, emiAmount } = buildScheduleAndPreview({
      principal: nextDisbursed,
      interestRate: loan.interestRate,
      interestMethod: loan.interestMethod,
      tenure: loan.tenure,
      tenureUnit: loan.tenureUnit,
      paymentFrequency: loan.paymentFrequency,
      customIntervalMonths: loan.customIntervalMonths,
      disbursementDate: loan.disbursementDate,
      firstPaymentDate: loan.firstPaymentDate,
      paymentDayMode: loan.paymentDayMode,
      paymentDay: loan.paymentDay,
      dayBasis: loan.dayBasis,
      compoundingFrequency: loan.compoundingFrequency,
      emiAmount: loan.emiIsManual ? loan.emiAmount : undefined,
      emiIsManual: loan.emiIsManual,
      repaymentType: effectiveRepaymentType(loan.repaymentType),
      scheduleVersion: next.scheduleVersion,
    });
    next = { ...next, emiAmount, maturityDate: preview.maturityDate };
    await saveScheduleRows(params.companyId, markHistorical(oldRows));
    await saveScheduleRows(
      params.companyId,
      refreshScheduleStatuses(next, materializeSchedule(params.companyId, loan.id, generated))
    );
  } else if (unpaidFuture[0] && unpaidFuture.length > 0 && nextOutstanding > 0) {
    const historical = markHistorical(unpaidFuture);
    const futureGenerated = regenerateFutureSchedule({
      loan: next,
      paidRows,
      outstandingPrincipal: nextOutstanding,
      interestRate: next.interestRate,
      remainingCount: unpaidFuture.length,
      firstFutureDate: unpaidFuture[0]!.dueDate,
      emiAmount: next.emiIsManual ? next.emiAmount : undefined,
      emiIsManual: next.emiIsManual,
    });
    const lastDue = futureGenerated[futureGenerated.length - 1]?.dueDate || next.maturityDate;
    next = { ...next, maturityDate: lastDue };
    await saveScheduleRows(params.companyId, historical);
    await saveScheduleRows(
      params.companyId,
      refreshScheduleStatuses(next, materializeSchedule(params.companyId, loan.id, futureGenerated))
    );
  }

  await saveLoan(next);
  await saveAudit(
    createAuditRow({
      companyId: params.companyId,
      loanId: loan.id,
      action: "disbursement_posted",
      userId: params.userId,
      userName: params.userName,
      oldValue: { disbursedAmount: loan.disbursedAmount, outstandingPrincipal: loan.outstandingPrincipal },
      newValue: { amount, disbursedAmount: next.disbursedAmount, journalId: journal.id },
      reason: params.reason || notes || "Additional disbursement",
    })
  );
  return next;
}

/** Journal voucher save ke baad loan schedule + transaction sync (Add Disbursement → journal flow). */
export async function recordLoanDisbursementFromJournal(params: {
  companyId: string;
  userId: string;
  userName: string;
  loanId: string;
  journalId: string;
}): Promise<Loan> {
  const loan = await getLoan(params.companyId, params.loanId);
  if (!loan) throw new Error("Loan not found.");
  if (loan.status === "closed" || loan.status === "cancelled") {
    throw new Error("Cannot disburse on a closed loan.");
  }
  if (loan.status === "draft" || !loan.disbursementJournalId) {
    throw new Error("Post the first disbursement from Save Loan first.");
  }

  const voucher = await getCompanyDocFromBrowserDb(params.companyId, "vouchers", params.journalId);
  if (!voucher) throw new Error("Saved journal voucher not found.");

  const journal = parseDisbursementJournalSnapshot(loan, voucher as Record<string, unknown>);
  return applyLoanDisbursementRecord({
    companyId: params.companyId,
    userId: params.userId,
    userName: params.userName,
    loan,
    journal,
    reason: journal.narration,
  });
}

export async function addLoanDisbursement(params: {
  companyId: string;
  userId: string;
  userName: string;
  company: Company | null;
  loanId: string;
  input: LoanDisbursementInput;
}): Promise<Loan> {
  const loan = await getLoan(params.companyId, params.loanId);
  if (!loan) throw new Error("Loan not found.");
  if (loan.status === "closed" || loan.status === "cancelled") {
    throw new Error("Cannot disburse on a closed loan.");
  }
  if (loan.status === "draft" || !loan.disbursementJournalId) {
    throw new Error("Post the first disbursement from Save Loan first.");
  }

  const amount = roundMoney(params.input.amount);
  if (!(amount > 0)) throw new Error("Disbursement amount must be greater than 0.");
  const remaining = remainingUndisbursedAmount(loan);
  if (amount > remaining + 0.009) {
    throw new Error(
      remaining > 0
        ? `Amount cannot exceed remaining sanctioned (${remaining}).`
        : "Sanctioned amount is fully disbursed. Edit Sanctioned Amount if the bank increased the limit."
    );
  }

  const bankAccountId = String(params.input.bankAccountId || loan.bankAccountId || "").trim();
  if (!bankAccountId) throw new Error("Bank / cash account is required.");
  if (!loan.loanAccountId) throw new Error("Loan liability account is missing.");

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
    dateIso: params.input.date,
    narration:
      String(params.input.notes || "").trim() ||
      `Loan disbursement — ${loan.loanName} (${loan.loanNumber})`,
    lines: disbursementLines(bankAccountId, loan.loanAccountId, amount),
    loanId: loan.id,
    loanTransactionKind: "disbursement",
    approve: true,
    fileUrls: attachments.fileUrls,
    preGeneratedVoucherId: attachments.preGeneratedVoucherId,
  });

  return applyLoanDisbursementRecord({
    companyId: params.companyId,
    userId: params.userId,
    userName: params.userName,
    loan,
    journal: {
      id: journal.id,
      voucherNumber: journal.voucherNumber,
      dateIso: params.input.date,
      narration:
        String(params.input.notes || "").trim() ||
        `Loan disbursement — ${loan.loanName} (${loan.loanNumber})`,
      bankAccountId,
      amount,
    },
    reason: params.input.notes || "Additional disbursement",
  });
}
