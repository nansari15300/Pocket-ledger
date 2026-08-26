import type { Company } from "@/hooks/useCompany";
import type { LoanChargeInput } from "../types/loanTransactionTypes";
import {
  createAuditRow,
  getLoan,
  saveAudit,
  saveCharge,
  saveLoan,
  saveTransaction,
} from "../db/loanRepository";
import { newLoanDocId, nowIso } from "../db/loanIds";
import { roundMoney } from "../utils/loanRounding";
import { chargeLines, postLoanJournal, resolveLoanJournalAttachments } from "./loanAccountingService";

export async function addLoanCharge(params: {
  companyId: string;
  userId: string;
  userName: string;
  company: Company | null;
  loanId: string;
  input: LoanChargeInput;
}): Promise<void> {
  const loan = await getLoan(params.companyId, params.loanId);
  if (!loan) throw new Error("Loan not found.");
  if (loan.status === "closed" || loan.status === "cancelled") throw new Error("Cannot add charges to a closed loan.");
  if (loan.status === "draft" || !loan.disbursementJournalId) {
    throw new Error("Post disbursement first. Draft loans cannot post charges.");
  }
  const amount = roundMoney(params.input.amount);
  if (!(amount > 0)) throw new Error("Charge amount must be greater than 0.");
  const accountId = params.input.accountId || loan.processingFeeAccountId;
  const bankAccountId = params.input.bankAccountId || loan.bankAccountId;

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
    narration: `${params.input.name || params.input.chargeType} — ${loan.loanName}`,
    lines: chargeLines(accountId, bankAccountId, amount),
    loanId: loan.id,
    loanTransactionKind: "charge",
    approve: true,
    fileUrls: attachments.fileUrls,
    preGeneratedVoucherId: attachments.preGeneratedVoucherId,
  });

  await saveCharge({
    id: newLoanDocId("chg"),
    companyId: params.companyId,
    loanId: loan.id,
    scheduleId: null,
    chargeType: params.input.chargeType,
    name: params.input.name || params.input.chargeType,
    amount,
    date: params.input.date,
    accountId,
    journalEntryId: journal.id,
    notes: params.input.notes || "",
    createdAt: nowIso(),
    createdBy: params.userId,
  });
  await saveTransaction({
    id: newLoanDocId("txn"),
    companyId: params.companyId,
    loanId: loan.id,
    scheduleId: null,
    kind: "charge",
    amount,
    principalAmount: 0,
    interestAmount: 0,
    chargeAmount: amount,
    lateFeeAmount: 0,
    paymentDate: params.input.date,
    journalDate: params.input.date,
    dueDate: null,
    bankAccountId,
    journalEntryId: journal.id,
    reversedTransactionId: null,
    reversalJournalId: null,
    referenceNumber: journal.voucherNumber,
    chequeNumber: "",
    bankTransactionId: "",
    paymentMode: "bank",
    notes: params.input.notes || "",
    createdAt: nowIso(),
    createdBy: params.userId,
    isReversed: false,
  });
  await saveLoan({
    ...loan,
    paidCharges: roundMoney(loan.paidCharges + amount),
    updatedAt: nowIso(),
    updatedBy: params.userId,
  });
  await saveAudit(
    createAuditRow({
      companyId: params.companyId,
      loanId: loan.id,
      action: "charge_added",
      userId: params.userId,
      userName: params.userName,
      oldValue: null,
      newValue: { name: params.input.name, amount, journalId: journal.id },
      reason: params.input.notes || "",
    })
  );
}
