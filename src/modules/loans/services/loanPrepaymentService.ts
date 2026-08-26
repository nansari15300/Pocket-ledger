import type { Company } from "@/hooks/useCompany";
import type { Loan } from "../types/loanTypes";
import type { LoanPrepaymentInput } from "../types/loanTransactionTypes";
import {
  createAuditRow,
  getLoan,
  listSchedules,
  saveAudit,
  saveLoan,
  saveScheduleRows,
  saveTransaction,
} from "../db/loanRepository";
import { currentSchedule } from "../db/loanQueries";
import { newLoanDocId, nowIso } from "../db/loanIds";
import { roundMoney } from "../utils/loanRounding";
import { addMonthsClamped, frequencyMonths } from "../utils/loanDateUtils";
import { markHistorical, materializeSchedule, regenerateFutureSchedule, refreshScheduleStatuses } from "./loanScheduleService";
import { postLoanJournal, prepaymentLines, resolveLoanJournalAttachments } from "./loanAccountingService";
import { calculateReducingEmi, periodicRate } from "../calculations/emiCalculator";
import { resolveEmi } from "../calculations/scheduleGenerator";
import { effectiveRepaymentType } from "../utils/loanRepaymentType";

export async function postPrepayment(params: {
  companyId: string;
  userId: string;
  userName: string;
  company: Company | null;
  loanId: string;
  input: LoanPrepaymentInput;
}): Promise<Loan> {
  const loan = await getLoan(params.companyId, params.loanId);
  if (!loan) throw new Error("Loan not found.");
  if (loan.status === "closed" || loan.status === "cancelled") throw new Error("Cannot prepay a closed loan.");
  if (loan.status === "draft" || !loan.disbursementJournalId) {
    throw new Error("Post disbursement first. Draft loans cannot take a prepayment.");
  }
  const amount = roundMoney(params.input.amount);
  if (!(amount > 0)) throw new Error("Prepayment amount must be greater than 0.");
  if (amount > loan.outstandingPrincipal) throw new Error("Prepayment cannot exceed outstanding principal.");

  const allRows = await listSchedules(params.companyId, loan.id);
  const live = currentSchedule(allRows);
  const unpaidFuture = live.filter((r) => r.status !== "paid" && !r.isHistorical);

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
    narration: `Loan prepayment — ${loan.loanName} (${loan.loanNumber})`,
    lines: prepaymentLines(loan.loanAccountId, params.input.bankAccountId || loan.bankAccountId, amount),
    loanId: loan.id,
    loanTransactionKind: "prepayment",
    approve: true,
    referenceNumber: params.input.referenceNumber,
    fileUrls: attachments.fileUrls,
    preGeneratedVoucherId: attachments.preGeneratedVoucherId,
  });

  const outstanding = roundMoney(loan.outstandingPrincipal - amount);
  const remainingCount = unpaidFuture.length;
  const repaymentType = effectiveRepaymentType(loan.repaymentType);
  let nextEmi = loan.emiAmount;
  let tenureLeft = remainingCount;
  if (params.input.mode === "reduce_emi" && remainingCount > 0 && outstanding > 0) {
    if (repaymentType === "interest_only" || repaymentType === "bullet") {
      nextEmi = resolveEmi({
        principal: outstanding,
        interestRate: loan.interestRate,
        interestMethod: loan.interestMethod,
        tenure: remainingCount * frequencyMonths(loan.paymentFrequency, loan.customIntervalMonths),
        tenureUnit: "months",
        paymentFrequency: loan.paymentFrequency,
        customIntervalMonths: loan.customIntervalMonths,
        disbursementDate: params.input.date,
        firstPaymentDate:
          unpaidFuture[0]?.dueDate ||
          addMonthsClamped(params.input.date, frequencyMonths(loan.paymentFrequency, loan.customIntervalMonths), {
            paymentDayMode: loan.paymentDayMode,
            paymentDay: loan.paymentDay,
          }),
        paymentDayMode: loan.paymentDayMode,
        paymentDay: loan.paymentDay,
        dayBasis: loan.dayBasis,
        compoundingFrequency: loan.compoundingFrequency,
        repaymentType,
      });
    } else {
      nextEmi = calculateReducingEmi(
        outstanding,
        periodicRate(loan.interestRate, loan.paymentFrequency),
        remainingCount
      );
    }
  }
  if (params.input.mode === "reduce_tenure" && outstanding > 0 && repaymentType === "emi") {
    const r = periodicRate(loan.interestRate, loan.paymentFrequency);
    let n = remainingCount;
    while (n > 1) {
      const emi = loan.emiIsManual ? loan.emiAmount : calculateReducingEmi(outstanding, r, n);
      const firstInterest = roundMoney(outstanding * r);
      if (emi > firstInterest) break;
      n -= 1;
    }
    tenureLeft = Math.max(1, n);
  }

  const firstFuture =
    unpaidFuture[0]?.dueDate ||
    addMonthsClamped(params.input.date, frequencyMonths(loan.paymentFrequency, loan.customIntervalMonths), {
      paymentDayMode: loan.paymentDayMode,
      paymentDay: loan.paymentDay,
    });

  const historical = markHistorical(unpaidFuture.filter((r) => r.status !== "partially_paid"));
  const generated = outstanding > 0
    ? regenerateFutureSchedule({
        loan,
        paidRows: live.filter((r) => r.status === "paid" || r.status === "partially_paid"),
        outstandingPrincipal: outstanding,
        interestRate: loan.interestRate,
        remainingCount: params.input.mode === "reduce_tenure" ? tenureLeft : remainingCount,
        firstFutureDate: firstFuture,
        emiAmount: params.input.mode === "reduce_emi" ? nextEmi : loan.emiAmount,
        emiIsManual: params.input.mode === "reduce_emi" ? true : loan.emiIsManual,
      })
    : [];

  const nextLoan: Loan = {
    ...loan,
    outstandingPrincipal: outstanding,
    paidPrincipal: roundMoney(loan.paidPrincipal + amount),
    emiAmount: params.input.mode === "reduce_emi" ? nextEmi : loan.emiAmount,
    emiIsManual: params.input.mode === "reduce_emi" ? true : loan.emiIsManual,
    scheduleVersion: loan.scheduleVersion + 1,
    maturityDate: generated[generated.length - 1]?.dueDate || params.input.date,
    updatedAt: nowIso(),
    updatedBy: params.userId,
    status: loan.status,
  };
  const newRows = refreshScheduleStatuses(nextLoan, materializeSchedule(params.companyId, loan.id, generated));

  await saveScheduleRows(params.companyId, [...historical, ...newRows]);
  await saveLoan(nextLoan);
  await saveTransaction({
    id: newLoanDocId("txn"),
    companyId: params.companyId,
    loanId: loan.id,
    scheduleId: null,
    kind: "prepayment",
    amount,
    principalAmount: amount,
    interestAmount: 0,
    chargeAmount: 0,
    lateFeeAmount: 0,
    paymentDate: params.input.date,
    journalDate: params.input.date,
    dueDate: null,
    bankAccountId: params.input.bankAccountId || loan.bankAccountId,
    journalEntryId: journal.id,
    reversedTransactionId: null,
    reversalJournalId: null,
    referenceNumber: params.input.referenceNumber || journal.voucherNumber,
    chequeNumber: params.input.chequeNumber || "",
    bankTransactionId: "",
    paymentMode: "bank",
    notes: params.input.notes || `Prepayment (${params.input.mode})`,
    createdAt: nowIso(),
    createdBy: params.userId,
    isReversed: false,
  });
  await saveAudit(
    createAuditRow({
      companyId: params.companyId,
      loanId: loan.id,
      action: "prepayment",
      userId: params.userId,
      userName: params.userName,
      oldValue: { outstanding: loan.outstandingPrincipal, emi: loan.emiAmount, version: loan.scheduleVersion },
      newValue: { outstanding, emi: nextLoan.emiAmount, version: nextLoan.scheduleVersion, mode: params.input.mode },
      reason: params.input.notes || "",
    })
  );
  return nextLoan;
}
