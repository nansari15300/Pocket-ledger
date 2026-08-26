import { saveVoucher } from "@/lib/voucherActionsClient";
import { getNextVoucherNumberForCompany } from "@/lib/nextVoucherNumber";
import { finalizeVoucherAttachmentsAfterFormSave } from "@/lib/voucherFormAttachmentSave";
import { roundMoney } from "../utils/loanRounding";
import { parseIsoDate } from "../utils/loanDateUtils";
import { prepareLoanJournalAttachments } from "./loanVoucherAttachmentSave";

export type JournalLine = { accountId: string; debit: number; credit: number };

export async function resolveLoanJournalAttachments(params: {
  companyId: string;
  companyPlanId?: string | null;
  companyStorageOption?: string | null;
  attachmentFiles?: (File | string)[];
}): Promise<{ fileUrls: string[]; preGeneratedVoucherId?: string }> {
  if (!params.attachmentFiles?.length) return { fileUrls: [] };
  return prepareLoanJournalAttachments({
    companyId: params.companyId,
    companyPlanId: params.companyPlanId,
    companyStorageOption: params.companyStorageOption,
    files: params.attachmentFiles,
  });
}

export async function postLoanJournal(params: {
  companyId: string;
  userId: string;
  companyDoc: Record<string, unknown> | null;
  dateIso: string;
  narration: string;
  lines: JournalLine[];
  loanId: string;
  loanScheduleId?: string | null;
  loanTransactionKind: string;
  approve?: boolean;
  referenceNumber?: string;
  fileUrls?: string[];
  preGeneratedVoucherId?: string | null;
  voucherNumber?: string;
  journalSubType?: string;
}): Promise<{ id: string; voucherNumber: string }> {
  const lines = params.lines
    .map((l) => ({
      accountId: l.accountId,
      debit: roundMoney(l.debit),
      credit: roundMoney(l.credit),
    }))
    .filter((l) => l.accountId && (l.debit > 0 || l.credit > 0));
  const debit = roundMoney(lines.reduce((s, l) => s + l.debit, 0));
  const credit = roundMoney(lines.reduce((s, l) => s + l.credit, 0));
  if (debit <= 0 || credit <= 0) throw new Error("Journal amount must be greater than 0.");
  if (debit !== credit) throw new Error("Journal is not balanced.");

  const numberingLike = params.journalSubType
    ? { type: "journal" as const, subType: params.journalSubType }
    : { type: "journal" as const };
  const voucherNumber =
    String(params.voucherNumber || "").trim() ||
    (await getNextVoucherNumberForCompany({
      companyId: params.companyId,
      companyDoc: params.companyDoc,
      voucherLike: numberingLike,
    }));

  const saved = await saveVoucher(
    params.companyId,
    params.userId,
    {
      type: "journal",
      ...(params.journalSubType ? { subType: params.journalSubType } : {}),
      voucherNumber,
      narration: params.narration,
      date: parseIsoDate(params.dateIso),
      total: debit,
      entries: lines,
      loanId: params.loanId,
      loanScheduleId: params.loanScheduleId || null,
      loanTransactionKind: params.loanTransactionKind,
      referenceNumber: params.referenceNumber || "",
      isLoanModuleVoucher: true,
      ...(params.fileUrls?.length ? { fileUrls: params.fileUrls } : {}),
    },
    params.preGeneratedVoucherId || null,
    params.approve ? { approvedByUserId: params.userId, approvedByName: "Loan Module" } : undefined
  );
  if (params.fileUrls?.length) {
    try {
      await finalizeVoucherAttachmentsAfterFormSave({
        companyId: params.companyId,
        voucherId: saved.id,
        rawFileUrls: params.fileUrls,
        storageFolder: "journal",
      });
    } catch {
      /* attachment finalize best-effort */
    }
  }
  return { id: saved.id, voucherNumber };
}

export async function postReversalJournal(params: {
  companyId: string;
  userId: string;
  companyDoc: Record<string, unknown> | null;
  dateIso: string;
  originalLines: JournalLine[];
  originalVoucherId: string;
  originalVoucherNumber?: string;
  loanId: string;
  narration: string;
  approve?: boolean;
}): Promise<{ id: string; voucherNumber: string }> {
  const reversed = params.originalLines.map((l) => ({
    accountId: l.accountId,
    debit: l.credit,
    credit: l.debit,
  }));
  return postLoanJournal({
    ...params,
    lines: reversed,
    loanTransactionKind: "reversal",
    narration: `${params.narration} (reverses ${params.originalVoucherNumber || params.originalVoucherId})`,
  });
}

export function disbursementLines(bankAccountId: string, loanAccountId: string, amount: number): JournalLine[] {
  return [
    { accountId: bankAccountId, debit: amount, credit: 0 },
    { accountId: loanAccountId, debit: 0, credit: amount },
  ];
}

export function emiLines(params: {
  loanAccountId: string;
  interestExpenseAccountId: string;
  bankAccountId: string;
  principal: number;
  interest: number;
  lateFee?: number;
  lateFeeAccountId?: string;
  otherCharges?: number;
  otherChargesAccountId?: string;
}): JournalLine[] {
  const lines: JournalLine[] = [];
  if (params.principal > 0) lines.push({ accountId: params.loanAccountId, debit: params.principal, credit: 0 });
  if (params.interest > 0) lines.push({ accountId: params.interestExpenseAccountId, debit: params.interest, credit: 0 });
  if ((params.lateFee || 0) > 0 && params.lateFeeAccountId) {
    lines.push({ accountId: params.lateFeeAccountId, debit: params.lateFee || 0, credit: 0 });
  }
  if ((params.otherCharges || 0) > 0 && params.otherChargesAccountId) {
    lines.push({ accountId: params.otherChargesAccountId, debit: params.otherCharges || 0, credit: 0 });
  }
  const total = roundMoney(
    params.principal + params.interest + (params.lateFee || 0) + (params.otherCharges || 0)
  );
  lines.push({ accountId: params.bankAccountId, debit: 0, credit: total });
  return lines;
}

export function chargeLines(expenseAccountId: string, bankAccountId: string, amount: number): JournalLine[] {
  return [
    { accountId: expenseAccountId, debit: amount, credit: 0 },
    { accountId: bankAccountId, debit: 0, credit: amount },
  ];
}

export function prepaymentLines(loanAccountId: string, bankAccountId: string, amount: number): JournalLine[] {
  return [
    { accountId: loanAccountId, debit: amount, credit: 0 },
    { accountId: bankAccountId, debit: 0, credit: amount },
  ];
}
