import { writeLoanEntity } from "../db/loanEntityWrite";
import { getCompanyDocFromBrowserDb } from "@/lib/localCompanyDocMirror";
import { LOAN_UNGROUPED_GROUP_ID } from "../constants/loanConstants";
import { nowIso } from "../db/loanIds";
import { listLoans } from "../db/loanRepository";
import { findOrCreateLoanLiabilityAccount } from "./loanAccountMappingService";

export type ConvertedBankLoanLink = {
  bankAccountId: string;
  loanAccountId: string;
  loanName: string;
  lenderName: string;
  bankAccountName: string;
};

function loanLedgerNameFromBank(accountName: string, edited?: string): string {
  const custom = String(edited || "").trim();
  if (custom) return custom;
  const base = String(accountName || "").trim() || "Bank";
  if (/\bloan\b/i.test(base)) return base;
  return `${base} Loan`;
}

/**
 * Keep the Bank/Cash ledger as money account.
 * Create/reuse Staff under Loans & Liabilities as the true loan payable.
 */
export async function convertExistingBankToLoanAccount(params: {
  companyId: string;
  userId: string;
  bankAccountId: string;
  loanLedgerName?: string;
  lenderName?: string;
}): Promise<ConvertedBankLoanLink> {
  const bank = (await getCompanyDocFromBrowserDb(params.companyId, "bank_accounts", params.bankAccountId)) as
    | Record<string, unknown>
    | null;
  if (!bank || bank.isDeleted === true) {
    throw new Error("Bank / cash account not found in this company.");
  }
  const bankAccountName = String(bank.accountName || bank.name || "").trim() || "Bank";
  const loanName = loanLedgerNameFromBank(bankAccountName, params.loanLedgerName);
  const lenderName =
    String(params.lenderName || "").trim() ||
    String(bank.bankName || "").trim() ||
    bankAccountName;

  const existingLink = String(bank.linkedLoanLiabilityId || "").trim();
  let loanAccountId = existingLink;
  if (loanAccountId) {
    const staff = (await getCompanyDocFromBrowserDb(params.companyId, "staff", loanAccountId)) as Record<
      string,
      unknown
    > | null;
    if (!staff || staff.isDeleted === true) loanAccountId = "";
  }
  if (!loanAccountId) {
    const used = new Set(
      (await listLoans(params.companyId)).map((l) => String(l.loanAccountId || "").trim()).filter(Boolean)
    );
    loanAccountId = await findOrCreateLoanLiabilityAccount(params.companyId, params.userId, loanName, used);
  }

  const staffPatch = await writeLoanEntity({
    companyId: params.companyId,
    collectionName: "staff",
    docId: loanAccountId,
    operation: "create",
    data: {
      id: loanAccountId,
      groupId: LOAN_UNGROUPED_GROUP_ID,
      companyId: params.companyId,
      ownerId: params.userId,
      isLoanAccount: true,
      convertedFromBankAccountId: params.bankAccountId,
      updatedAt: nowIso(),
    },
    options: { merge: true, skipPlanMutationGate: true },
  });
  if (staffPatch.ok === false) throw new Error(staffPatch.error || "Could not update loan liability account.");

  const bankPatch = await writeLoanEntity({
    companyId: params.companyId,
    collectionName: "bank_accounts",
    docId: params.bankAccountId,
    operation: "create",
    data: {
      linkedLoanLiabilityId: loanAccountId,
      loanModuleLinked: true,
      loanModuleLinkedAt: nowIso(),
    },
    options: { merge: true, skipPlanMutationGate: true },
  });
  if (bankPatch.ok === false) throw new Error(bankPatch.error || "Could not link the bank account.");

  const linkedStaff = (await getCompanyDocFromBrowserDb(params.companyId, "staff", loanAccountId)) as Record<
    string,
    unknown
  > | null;
  const actualLoanName = String(linkedStaff?.name || loanName).trim() || loanName;

  return {
    bankAccountId: params.bankAccountId,
    loanAccountId,
    loanName: actualLoanName,
    lenderName,
    bankAccountName,
  };
}
