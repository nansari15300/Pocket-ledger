import { writeLoanEntity } from "../db/loanEntityWrite";
import { listCompanyDocsFromBrowserDb } from "@/lib/localCompanyDocMirror";
import {
  LOAN_FINANCE_GROUP_NAME,
  LOAN_INTEREST_ACCOUNT_NAME,
  LOAN_LATE_FEE_ACCOUNT_NAME,
  LOAN_UNGROUPED_GROUP_ID,
  LOAN_PROCESSING_ACCOUNT_NAME,
} from "../constants/loanConstants";
import { newLoanDocId, nowIso } from "../db/loanIds";
import { listLoans } from "../db/loanRepository";
import { isLoanLiabilityStaff } from "../utils/loanLiabilityStaff";

type NamedDoc = {
  id: string;
  name?: string;
  accountName?: string;
  isDeleted?: boolean;
  groupId?: string;
  isLoanAccount?: boolean;
};

function norm(name: string): string {
  return String(name || "").trim().toLowerCase();
}

async function listNamed(companyId: string, collectionName: string): Promise<NamedDoc[]> {
  const rows = await listCompanyDocsFromBrowserDb(companyId, collectionName, { forBackupMerge: true });
  return (rows as NamedDoc[]).filter((r) => !r.isDeleted);
}

function findByName(rows: NamedDoc[], name: string): NamedDoc | undefined {
  const n = norm(name);
  return rows.find((r) => norm(String(r.name || r.accountName || "")) === n);
}

async function createDoc(
  companyId: string,
  collectionName: string,
  payload: Record<string, unknown>
): Promise<string> {
  const id = String(payload.id || newLoanDocId(collectionName.replace(/s$/, "")));
  const res = await writeLoanEntity({
    companyId,
    collectionName,
    docId: id,
    operation: "create",
    data: { ...payload, id, companyId, createdAt: nowIso(), isDeleted: false },
    options: { merge: true, skipPlanMutationGate: true },
  });
  if (res.ok === false) throw new Error(res.error || `Failed to create ${collectionName}`);
  return res.docId;
}

export async function findOrCreateExpenseGroup(
  companyId: string,
  userId: string,
  name: string,
  parentId = "indirect_expense"
): Promise<string> {
  const groups = await listNamed(companyId, "expense_groups");
  const existing = findByName(groups, name);
  if (existing) return existing.id;
  return createDoc(companyId, "expense_groups", {
    id: newLoanDocId("expg"),
    name,
    parentId,
    type: "Expense",
    ownerId: userId,
    debit: 0,
    credit: 0,
    balance: 0,
  });
}

export async function findOrCreateExpenseAccount(
  companyId: string,
  userId: string,
  name: string,
  groupId: string
): Promise<string> {
  const accounts = await listNamed(companyId, "expense_accounts");
  const existing = findByName(accounts, name);
  if (existing) return existing.id;
  return createDoc(companyId, "expense_accounts", {
    id: newLoanDocId("exp"),
    name,
    groupId,
    type: "Expense",
    ownerId: userId,
    openingBalance: 0,
    balance: 0,
    debit: 0,
    credit: 0,
  });
}

function uniqueStaffName(staff: NamedDoc[], preferred: string): string {
  const taken = new Set(staff.map((r) => norm(String(r.name || r.accountName || ""))));
  if (!taken.has(norm(preferred))) return preferred;
  let i = 2;
  while (taken.has(norm(`${preferred} (${i})`))) i += 1;
  return `${preferred} (${i})`;
}

export async function findOrCreateLoanLiabilityAccount(
  companyId: string,
  userId: string,
  name: string,
  usedByOtherLoans?: Set<string>,
  groupId?: string
): Promise<string> {
  const staff = await listNamed(companyId, "staff");
  const wanted = String(name || "").trim() || "Loan";
  const existingLiability = staff.find((r) => norm(String(r.name || r.accountName || "")) === norm(wanted) && isLoanLiabilityStaff(r));
  if (existingLiability && !usedByOtherLoans?.has(existingLiability.id)) {
    return existingLiability.id;
  }

  let ledgerName = wanted;
  if (existingLiability && usedByOtherLoans?.has(existingLiability.id)) {
    ledgerName = uniqueStaffName(staff, wanted);
  } else {
    const employeeClash = staff.find(
      (r) => norm(String(r.name || r.accountName || "")) === norm(wanted) && !isLoanLiabilityStaff(r)
    );
    if (employeeClash) {
      ledgerName = uniqueStaffName(staff, /\bloan\b/i.test(wanted) ? `${wanted} Liability` : `${wanted} Loan`);
    }
  }

  return createDoc(companyId, "staff", {
    id: newLoanDocId("loanacc"),
    name: ledgerName,
    groupId: String(groupId || "").trim() || LOAN_UNGROUPED_GROUP_ID,
    ownerId: userId,
    openingBalance: 0,
    balance: 0,
    debit: 0,
    credit: 0,
    isLoanAccount: true,
  });
}

export type LoanAccountMap = {
  loanAccountId: string;
  interestExpenseAccountId: string;
  processingFeeAccountId: string;
  lateFeeAccountId: string;
  financeGroupId: string;
};

export async function ensureLoanAccountingAccounts(params: {
  companyId: string;
  userId: string;
  loanName: string;
  lenderName: string;
  loanAccountId?: string;
  interestExpenseAccountId?: string;
  processingFeeAccountId?: string;
  lateFeeAccountId?: string;
  createLoanAccount?: boolean;
  createInterestAccount?: boolean;
  loanLiabilityGroupId?: string;
}): Promise<LoanAccountMap> {
  const financeGroupId = await findOrCreateExpenseGroup(params.companyId, params.userId, LOAN_FINANCE_GROUP_NAME);
  const liabilityName = params.loanName.trim() || `${params.lenderName.trim()} Loan`;
  const otherLoans = await listLoans(params.companyId);
  const usedLiabilityIds = new Set(
    otherLoans.map((l) => String(l.loanAccountId || "").trim()).filter(Boolean)
  );

  const loanAccountId =
    params.loanAccountId ||
    (params.createLoanAccount !== false
      ? await findOrCreateLoanLiabilityAccount(
          params.companyId,
          params.userId,
          liabilityName,
          usedLiabilityIds,
          params.loanLiabilityGroupId
        )
      : "");
  if (!loanAccountId) throw new Error("Loan liability account is required.");

  const interestExpenseAccountId =
    params.interestExpenseAccountId ||
    (params.createInterestAccount !== false
      ? await findOrCreateExpenseAccount(params.companyId, params.userId, LOAN_INTEREST_ACCOUNT_NAME, financeGroupId)
      : "");
  if (!interestExpenseAccountId) throw new Error("Interest expense account is required.");

  const processingFeeAccountId =
    params.processingFeeAccountId ||
    (await findOrCreateExpenseAccount(params.companyId, params.userId, LOAN_PROCESSING_ACCOUNT_NAME, financeGroupId));
  const lateFeeAccountId =
    params.lateFeeAccountId ||
    (await findOrCreateExpenseAccount(params.companyId, params.userId, LOAN_LATE_FEE_ACCOUNT_NAME, financeGroupId));

  return {
    loanAccountId,
    interestExpenseAccountId,
    processingFeeAccountId,
    lateFeeAccountId,
    financeGroupId,
  };
}
