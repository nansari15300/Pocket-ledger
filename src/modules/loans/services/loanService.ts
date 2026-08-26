import type { Company } from "@/hooks/useCompany";
import type { Loan, LoanDraftInput } from "../types/loanTypes";
import type { LoanScheduleRow } from "../types/loanScheduleTypes";
import { validateLoanDraft } from "../utils/loanValidation";
import { roundMoney } from "../utils/loanRounding";
import { newLoanDocId, nowIso } from "../db/loanIds";
import {
  createAuditRow,
  listLoans,
  saveAudit,
  saveLoan,
  saveRateHistory,
  saveScheduleRows,
  saveTransaction,
} from "../db/loanRepository";
import { ensureLoanAccountingAccounts } from "./loanAccountMappingService";
import { buildScheduleAndPreview } from "./loanCalculationService";
import { materializeSchedule, refreshScheduleStatuses } from "./loanScheduleService";
import { disbursementLines, postLoanJournal } from "./loanAccountingService";
import { saveLoanLiabilityAttachments } from "./loanLiabilityAttachmentSave";
import { effectiveRepaymentType } from "../utils/loanRepaymentType";

function nextLoanNumber(existing: Loan[]): string {
  let max = 0;
  for (const loan of existing) {
    const m = String(loan.loanNumber || "").match(/(\d+)\s*$/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `LN-${String(max + 1).padStart(4, "0")}`;
}

async function maybeSaveLoanLiabilityAttachments(params: {
  companyId: string;
  company: Company | null;
  staffId: string;
  input: LoanDraftInput;
}): Promise<void> {
  const staffId = String(params.staffId || "").trim();
  if (!staffId) return;
  await saveLoanLiabilityAttachments({
    companyId: params.companyId,
    company: params.company,
    staffId,
    avatar: params.input.liabilityAvatar ?? null,
    documents: params.input.liabilityDocuments ?? [],
  });
}

export async function createLoan(params: {
  companyId: string;
  userId: string;
  userName: string;
  company: Company | null;
  input: LoanDraftInput;
}): Promise<{ loan: Loan; schedule: LoanScheduleRow[] }> {
  const issues = validateLoanDraft(params.input);
  if (issues.length) throw new Error(issues[0]!.message);
  if (!params.companyId) throw new Error("Company is required.");

  const existing = await listLoans(params.companyId);
  const loanNumber = String(params.input.loanNumber || "").trim() || nextLoanNumber(existing);
  if (existing.some((l) => l.loanNumber.toLowerCase() === loanNumber.toLowerCase())) {
    throw new Error("Loan number already exists in this company.");
  }

  const accounts = await ensureLoanAccountingAccounts({
    companyId: params.companyId,
    userId: params.userId,
    loanName: params.input.loanName,
    lenderName: params.input.lenderName,
    loanAccountId: params.input.loanAccountId,
    interestExpenseAccountId: params.input.interestExpenseAccountId,
    processingFeeAccountId: params.input.processingFeeAccountId,
    lateFeeAccountId: params.input.lateFeeAccountId,
    createLoanAccount: params.input.createLoanAccount !== false,
    createInterestAccount: params.input.createInterestAccount !== false,
    loanLiabilityGroupId: params.input.loanLiabilityGroupId,
  });

  const principal = roundMoney(params.input.principalAmount);
  const disbursed = roundMoney(params.input.disbursedAmount || params.input.principalAmount);
  const { schedule: generated, preview, emiAmount } = buildScheduleAndPreview({
    principal: disbursed,
    interestRate: params.input.interestRate,
    interestMethod: params.input.interestMethod,
    tenure: params.input.tenure,
    tenureUnit: params.input.tenureUnit,
    paymentFrequency: params.input.paymentFrequency,
    customIntervalMonths: params.input.customIntervalMonths,
    disbursementDate: params.input.disbursementDate,
    firstPaymentDate: params.input.firstPaymentDate,
    paymentDayMode: params.input.paymentDayMode,
    paymentDay: params.input.paymentDay,
    dayBasis: params.input.dayBasis,
    compoundingFrequency: params.input.compoundingFrequency,
    emiAmount: params.input.emiAmount,
    emiIsManual: params.input.emiIsManual,
    repaymentType: effectiveRepaymentType(params.input.repaymentType),
    scheduleVersion: 1,
  });

  const loanId = newLoanDocId("loan");
  const ts = nowIso();
  const loanType =
    params.input.loanType === "Other" && params.input.customLoanType
      ? params.input.customLoanType.trim()
      : params.input.loanType;

  let loan: Loan = {
    id: loanId,
    companyId: params.companyId,
    loanNumber,
    loanName: params.input.loanName.trim(),
    lenderName: params.input.lenderName.trim(),
    lenderType: params.input.lenderType,
    bankAccountId: params.input.bankAccountId,
    loanAccountId: accounts.loanAccountId,
    interestExpenseAccountId: accounts.interestExpenseAccountId,
    processingFeeAccountId: accounts.processingFeeAccountId,
    lateFeeAccountId: accounts.lateFeeAccountId,
    convertedFromBankAccountId: String(params.input.convertedFromBankAccountId || "").trim() || undefined,
    loanType,
    loanPurpose: params.input.loanPurpose || "",
    principalAmount: principal,
    disbursedAmount: disbursed,
    disbursementDate: params.input.disbursementDate,
    firstPaymentDate: params.input.firstPaymentDate,
    maturityDate: preview.maturityDate,
    interestMethod: params.input.interestMethod,
    interestRate: params.input.interestRate,
    interestRateType: params.input.interestRateType,
    tenure: params.input.tenure,
    tenureUnit: params.input.tenureUnit,
    paymentFrequency: params.input.paymentFrequency,
    customIntervalMonths: params.input.customIntervalMonths || 1,
    emiAmount,
    emiIsManual: !!params.input.emiIsManual,
    repaymentType: effectiveRepaymentType(params.input.repaymentType),
    paymentDayMode: params.input.paymentDayMode,
    paymentDay: params.input.paymentDay || 1,
    gracePeriodDays: params.input.gracePeriodDays || 0,
    dayBasis: params.input.dayBasis || 365,
    compoundingFrequency: params.input.compoundingFrequency || params.input.paymentFrequency,
    lateFeeMode: params.input.lateFeeMode,
    lateFeeValue: params.input.lateFeeValue || 0,
    autoPostLateFee: !!params.input.autoPostLateFee,
    postDisbursementOnSave: params.input.postDisbursementOnSave !== false,
    disbursementJournalId: null,
    scheduleVersion: 1,
    outstandingPrincipal: params.input.postDisbursementOnSave !== false ? disbursed : 0,
    outstandingInterest: 0,
    accruedInterest: 0,
    paidPrincipal: 0,
    paidInterest: 0,
    paidCharges: 0,
    status: params.input.postDisbursementOnSave !== false ? "active" : "draft",
    notes: params.input.notes || "",
    createdAt: ts,
    updatedAt: ts,
    closedAt: null,
    createdBy: params.userId,
    updatedBy: params.userId,
  };

  const schedule = refreshScheduleStatuses(loan, materializeSchedule(params.companyId, loanId, generated));
  await saveLoan(loan);
  await saveScheduleRows(params.companyId, schedule);
  await saveRateHistory({
    id: newLoanDocId("rate"),
    companyId: params.companyId,
    loanId,
    effectiveDate: params.input.disbursementDate,
    oldRate: params.input.interestRate,
    newRate: params.input.interestRate,
    reason: "Initial rate",
    createdAt: ts,
    createdBy: params.userId,
    userName: params.userName,
  });
  await saveAudit(
    createAuditRow({
      companyId: params.companyId,
      loanId,
      action: "loan_created",
      userId: params.userId,
      userName: params.userName,
      oldValue: null,
      newValue: { loanNumber, principal, emiAmount },
      reason: "",
    })
  );
  await saveAudit(
    createAuditRow({
      companyId: params.companyId,
      loanId,
      action: "schedule_generated",
      userId: params.userId,
      userName: params.userName,
      oldValue: null,
      newValue: { version: 1, installments: schedule.length },
      reason: "",
    })
  );

  if (loan.postDisbursementOnSave && disbursed > 0) {
    const journal = await postLoanJournal({
      companyId: params.companyId,
      userId: params.userId,
      companyDoc: params.company as unknown as Record<string, unknown>,
      dateIso: loan.disbursementDate,
      narration: `Loan disbursement — ${loan.loanName} (${loan.loanNumber})`,
      lines: disbursementLines(loan.bankAccountId, loan.loanAccountId, disbursed),
      loanId,
      loanTransactionKind: "disbursement",
      approve: true,
    });
    loan = {
      ...loan,
      disbursementJournalId: journal.id,
      status: "active",
      updatedAt: nowIso(),
    };
    await saveLoan(loan);
    await saveTransaction({
      id: newLoanDocId("txn"),
      companyId: params.companyId,
      loanId,
      scheduleId: null,
      kind: "disbursement",
      amount: disbursed,
      principalAmount: disbursed,
      interestAmount: 0,
      chargeAmount: 0,
      lateFeeAmount: 0,
      paymentDate: loan.disbursementDate,
      journalDate: loan.disbursementDate,
      dueDate: null,
      bankAccountId: loan.bankAccountId,
      journalEntryId: journal.id,
      reversedTransactionId: null,
      reversalJournalId: null,
      referenceNumber: journal.voucherNumber,
      chequeNumber: "",
      bankTransactionId: "",
      paymentMode: "bank",
      notes: "Disbursement",
      createdAt: nowIso(),
      createdBy: params.userId,
      isReversed: false,
    });
    await saveAudit(
      createAuditRow({
        companyId: params.companyId,
        loanId,
        action: "disbursement_posted",
        userId: params.userId,
        userName: params.userName,
        oldValue: null,
        newValue: { journalId: journal.id, amount: disbursed },
        reason: "",
      })
    );
  }

  if (loan.loanAccountId) {
    await maybeSaveLoanLiabilityAttachments({
      companyId: params.companyId,
      company: params.company,
      staffId: loan.loanAccountId,
      input: params.input,
    });
  }

  return { loan, schedule };
}

function resolvedLoanType(input: LoanDraftInput): string {
  if (input.loanType === "Other" && input.customLoanType) return input.customLoanType.trim();
  return input.loanType;
}

export async function updateLoan(params: {
  companyId: string;
  loanId: string;
  userId: string;
  userName: string;
  company?: Company | null;
  input: LoanDraftInput;
}): Promise<Loan> {
  const { getLoan, listSchedules } = await import("../db/loanRepository");
  const { writeLoanEntity } = await import("../db/loanEntityWrite");
  const { LOAN_UNGROUPED_GROUP_ID } = await import("../constants/loanConstants");
  const { markHistorical, materializeSchedule, refreshScheduleStatuses } = await import("./loanScheduleService");

  const loan = await getLoan(params.companyId, params.loanId);
  if (!loan) throw new Error("Loan not found.");
  if (loan.status === "cancelled") throw new Error("Cancelled loans cannot be edited.");

  const issues = validateLoanDraft(params.input);
  if (issues.length) throw new Error(issues[0]!.message);

  const existing = await listLoans(params.companyId);
  const nextNumber = String(params.input.loanNumber || loan.loanNumber).trim() || loan.loanNumber;
  if (
    existing.some(
      (row) => row.id !== loan.id && String(row.loanNumber || "").toLowerCase() === nextNumber.toLowerCase()
    )
  ) {
    throw new Error("Loan number already exists in this company.");
  }

  const posted = Boolean(loan.disbursementJournalId);
  const nextName = String(params.input.loanName || loan.loanName).trim();
  let next: Loan = {
    ...loan,
    loanName: nextName,
    loanNumber: posted ? loan.loanNumber : nextNumber,
    lenderName: String(params.input.lenderName || loan.lenderName).trim(),
    lenderType: params.input.lenderType || loan.lenderType,
    loanType: resolvedLoanType(params.input) || loan.loanType,
    loanPurpose: params.input.loanPurpose ?? loan.loanPurpose,
    notes: params.input.notes ?? loan.notes,
    updatedAt: nowIso(),
    updatedBy: params.userId,
  };

  if (!posted) {
    const { schedule: generated, preview, emiAmount } = buildScheduleAndPreview({
      principal: roundMoney(params.input.disbursedAmount || params.input.principalAmount),
      interestRate: params.input.interestRate,
      interestMethod: params.input.interestMethod,
      tenure: params.input.tenure,
      tenureUnit: params.input.tenureUnit,
      paymentFrequency: params.input.paymentFrequency,
      customIntervalMonths: params.input.customIntervalMonths,
      disbursementDate: params.input.disbursementDate,
      firstPaymentDate: params.input.firstPaymentDate,
      paymentDayMode: params.input.paymentDayMode,
      paymentDay: params.input.paymentDay,
      dayBasis: params.input.dayBasis,
      compoundingFrequency: params.input.compoundingFrequency,
      emiAmount: params.input.emiAmount,
      emiIsManual: params.input.emiIsManual,
      repaymentType: effectiveRepaymentType(params.input.repaymentType),
      scheduleVersion: loan.scheduleVersion + 1,
    });
    next = {
      ...next,
      bankAccountId: params.input.bankAccountId || loan.bankAccountId,
      principalAmount: roundMoney(params.input.principalAmount),
      disbursedAmount: roundMoney(params.input.disbursedAmount || params.input.principalAmount),
      disbursementDate: params.input.disbursementDate,
      firstPaymentDate: params.input.firstPaymentDate,
      maturityDate: preview.maturityDate,
      interestMethod: params.input.interestMethod,
      interestRate: params.input.interestRate,
      interestRateType: params.input.interestRateType,
      tenure: params.input.tenure,
      tenureUnit: params.input.tenureUnit,
      paymentFrequency: params.input.paymentFrequency,
      customIntervalMonths: params.input.customIntervalMonths || 1,
      emiAmount,
      emiIsManual: !!params.input.emiIsManual,
      repaymentType: effectiveRepaymentType(params.input.repaymentType),
      paymentDayMode: params.input.paymentDayMode,
      paymentDay: params.input.paymentDay || 1,
      gracePeriodDays: params.input.gracePeriodDays || 0,
      dayBasis: params.input.dayBasis || 365,
      compoundingFrequency: params.input.compoundingFrequency || params.input.paymentFrequency,
      lateFeeMode: params.input.lateFeeMode,
      lateFeeValue: params.input.lateFeeValue || 0,
      autoPostLateFee: !!params.input.autoPostLateFee,
      outstandingPrincipal: 0,
      scheduleVersion: loan.scheduleVersion + 1,
    };
    const oldRows = await listSchedules(params.companyId, loan.id);
    await saveScheduleRows(params.companyId, markHistorical(oldRows));
    await saveScheduleRows(
      params.companyId,
      refreshScheduleStatuses(next, materializeSchedule(params.companyId, loan.id, generated))
    );
  }

  await saveLoan(next);
  if (next.loanAccountId && nextName) {
    const staffPatch = await writeLoanEntity({
      companyId: params.companyId,
      collectionName: "staff",
      docId: next.loanAccountId,
      operation: "create",
      data: {
        id: next.loanAccountId,
        name: nextName,
        groupId: LOAN_UNGROUPED_GROUP_ID,
        isLoanAccount: true,
        updatedAt: nowIso(),
      },
      options: { merge: true, skipPlanMutationGate: true },
    });
    if (staffPatch.ok === false) throw new Error(staffPatch.error || "Could not update loan account name.");
  }
  if (next.loanAccountId) {
    await maybeSaveLoanLiabilityAttachments({
      companyId: params.companyId,
      company: params.company ?? null,
      staffId: next.loanAccountId,
      input: params.input,
    });
  }
  await saveAudit(
    createAuditRow({
      companyId: params.companyId,
      loanId: loan.id,
      action: "loan_updated",
      userId: params.userId,
      userName: params.userName,
      oldValue: { loanName: loan.loanName, lenderName: loan.lenderName, notes: loan.notes },
      newValue: { loanName: next.loanName, lenderName: next.lenderName, notes: next.notes, posted },
      reason: posted ? "Identity fields" : "Draft loan updated",
    })
  );
  return next;
}

export async function updateLoanDraft(
  companyId: string,
  loanId: string,
  userId: string,
  userName: string,
  patch: Partial<LoanDraftInput>
): Promise<Loan> {
  const { getLoan } = await import("../db/loanRepository");
  const loan = await getLoan(companyId, loanId);
  if (!loan) throw new Error("Loan not found.");
  return updateLoan({
    companyId,
    loanId,
    userId,
    userName,
    input: {
      loanName: patch.loanName ?? loan.loanName,
      loanNumber: patch.loanNumber ?? loan.loanNumber,
      lenderName: patch.lenderName ?? loan.lenderName,
      lenderType: patch.lenderType ?? loan.lenderType,
      bankAccountId: patch.bankAccountId ?? loan.bankAccountId,
      loanAccountId: loan.loanAccountId,
      interestExpenseAccountId: loan.interestExpenseAccountId,
      processingFeeAccountId: loan.processingFeeAccountId,
      lateFeeAccountId: loan.lateFeeAccountId,
      createLoanAccount: false,
      createInterestAccount: false,
      loanType: patch.loanType ?? loan.loanType,
      customLoanType: patch.customLoanType,
      loanPurpose: patch.loanPurpose ?? loan.loanPurpose,
      principalAmount: patch.principalAmount ?? loan.principalAmount,
      disbursedAmount: patch.disbursedAmount ?? loan.disbursedAmount,
      disbursementDate: patch.disbursementDate ?? loan.disbursementDate,
      firstPaymentDate: patch.firstPaymentDate ?? loan.firstPaymentDate,
      interestMethod: patch.interestMethod ?? loan.interestMethod,
      interestRate: patch.interestRate ?? loan.interestRate,
      interestRateType: patch.interestRateType ?? loan.interestRateType,
      tenure: patch.tenure ?? loan.tenure,
      tenureUnit: patch.tenureUnit ?? loan.tenureUnit,
      paymentFrequency: patch.paymentFrequency ?? loan.paymentFrequency,
      customIntervalMonths: patch.customIntervalMonths ?? loan.customIntervalMonths,
      emiAmount: patch.emiAmount ?? loan.emiAmount,
      emiIsManual: patch.emiIsManual ?? loan.emiIsManual,
      repaymentType: effectiveRepaymentType(patch.repaymentType ?? loan.repaymentType),
      paymentDayMode: patch.paymentDayMode ?? loan.paymentDayMode,
      paymentDay: patch.paymentDay ?? loan.paymentDay,
      gracePeriodDays: patch.gracePeriodDays ?? loan.gracePeriodDays,
      dayBasis: patch.dayBasis ?? loan.dayBasis,
      compoundingFrequency: patch.compoundingFrequency ?? loan.compoundingFrequency,
      lateFeeMode: patch.lateFeeMode ?? loan.lateFeeMode,
      lateFeeValue: patch.lateFeeValue ?? loan.lateFeeValue,
      autoPostLateFee: patch.autoPostLateFee ?? loan.autoPostLateFee,
      postDisbursementOnSave: false,
      notes: patch.notes ?? loan.notes,
    },
  });
}
