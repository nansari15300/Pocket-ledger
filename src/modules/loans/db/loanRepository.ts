import { writeLoanEntity } from "./loanEntityWrite";
import {
  getCompanyDocFromBrowserDb,
  listCompanyDocsFromBrowserDb,
} from "@/lib/localCompanyDocMirror";
import { LOAN_COLLECTIONS, LOAN_SETTINGS_DOC_ID } from "../constants/loanConstants";
import type { Loan, LoanSettings } from "../types/loanTypes";
import type { LoanScheduleRow } from "../types/loanScheduleTypes";
import type {
  LoanAuditLog,
  LoanCharge,
  LoanDocument,
  LoanRateHistory,
  LoanTransaction,
} from "../types/loanTransactionTypes";
import { newLoanDocId, nowIso, sameCompany } from "./loanIds";

async function upsertDoc(
  companyId: string,
  collectionName: string,
  docId: string,
  data: Record<string, unknown>
): Promise<string> {
  const res = await writeLoanEntity({
    companyId,
    collectionName,
    docId,
    operation: "create",
    data: { ...data, id: docId, companyId },
    options: { merge: true, skipPlanMutationGate: collectionName !== "vouchers" },
  });
  if (res.ok === false) throw new Error(res.error || `Failed to write ${collectionName}`);
  return res.docId;
}

async function listCollection<T extends { companyId?: string }>(
  companyId: string,
  collectionName: string
): Promise<T[]> {
  const rows = await listCompanyDocsFromBrowserDb(companyId, collectionName, { forBackupMerge: true });
  return (rows as T[]).filter((row) => sameCompany(row, companyId) && !(row as { isDeleted?: boolean }).isDeleted);
}

export async function saveLoan(loan: Loan): Promise<string> {
  return upsertDoc(loan.companyId, LOAN_COLLECTIONS.loans, loan.id, loan as unknown as Record<string, unknown>);
}

export async function getLoan(companyId: string, loanId: string): Promise<Loan | null> {
  const row = await getCompanyDocFromBrowserDb(companyId, LOAN_COLLECTIONS.loans, loanId);
  if (!row || !sameCompany(row as Loan, companyId)) return null;
  return row as Loan;
}

export async function listLoans(companyId: string): Promise<Loan[]> {
  const rows = await listCollection<Loan>(companyId, LOAN_COLLECTIONS.loans);
  return rows.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

export async function saveScheduleRows(companyId: string, rows: LoanScheduleRow[]): Promise<void> {
  for (const row of rows) {
    await upsertDoc(companyId, LOAN_COLLECTIONS.schedules, row.id, row as unknown as Record<string, unknown>);
  }
}

export async function listSchedules(companyId: string, loanId: string): Promise<LoanScheduleRow[]> {
  const rows = await listCollection<LoanScheduleRow>(companyId, LOAN_COLLECTIONS.schedules);
  return rows
    .filter((r) => r.loanId === loanId)
    .sort((a, b) => a.scheduleVersion - b.scheduleVersion || a.installmentNumber - b.installmentNumber);
}

export async function getScheduleRow(companyId: string, scheduleId: string): Promise<LoanScheduleRow | null> {
  const row = await getCompanyDocFromBrowserDb(companyId, LOAN_COLLECTIONS.schedules, scheduleId);
  if (!row || !sameCompany(row as LoanScheduleRow, companyId)) return null;
  return row as LoanScheduleRow;
}

export async function saveTransaction(tx: LoanTransaction): Promise<string> {
  return upsertDoc(tx.companyId, LOAN_COLLECTIONS.transactions, tx.id, tx as unknown as Record<string, unknown>);
}

export async function listTransactions(companyId: string, loanId: string): Promise<LoanTransaction[]> {
  const rows = await listCollection<LoanTransaction>(companyId, LOAN_COLLECTIONS.transactions);
  return rows
    .filter((r) => r.loanId === loanId)
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

export async function saveRateHistory(row: LoanRateHistory): Promise<string> {
  return upsertDoc(row.companyId, LOAN_COLLECTIONS.rateHistory, row.id, row as unknown as Record<string, unknown>);
}

export async function listRateHistory(companyId: string, loanId: string): Promise<LoanRateHistory[]> {
  const rows = await listCollection<LoanRateHistory>(companyId, LOAN_COLLECTIONS.rateHistory);
  return rows
    .filter((r) => r.loanId === loanId)
    .sort((a, b) => String(a.effectiveDate).localeCompare(String(b.effectiveDate)));
}

export async function saveCharge(row: LoanCharge): Promise<string> {
  return upsertDoc(row.companyId, LOAN_COLLECTIONS.charges, row.id, row as unknown as Record<string, unknown>);
}

export async function listCharges(companyId: string, loanId: string): Promise<LoanCharge[]> {
  const rows = await listCollection<LoanCharge>(companyId, LOAN_COLLECTIONS.charges);
  return rows
    .filter((r) => r.loanId === loanId)
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

export async function saveAudit(row: LoanAuditLog): Promise<string> {
  return upsertDoc(row.companyId, LOAN_COLLECTIONS.audit, row.id, row as unknown as Record<string, unknown>);
}

export async function listAudit(companyId: string, loanId: string): Promise<LoanAuditLog[]> {
  const rows = await listCollection<LoanAuditLog>(companyId, LOAN_COLLECTIONS.audit);
  return rows
    .filter((r) => r.loanId === loanId)
    .sort((a, b) => String(b.timestamp || "").localeCompare(String(a.timestamp || "")));
}

export async function saveDocument(row: LoanDocument): Promise<string> {
  return upsertDoc(row.companyId, LOAN_COLLECTIONS.documents, row.id, row as unknown as Record<string, unknown>);
}

export async function listDocuments(companyId: string, loanId: string): Promise<LoanDocument[]> {
  const rows = await listCollection<LoanDocument>(companyId, LOAN_COLLECTIONS.documents);
  return rows.filter((r) => r.loanId === loanId);
}

export async function getLoanSettings(companyId: string): Promise<LoanSettings | null> {
  const row = await getCompanyDocFromBrowserDb(companyId, LOAN_COLLECTIONS.settings, LOAN_SETTINGS_DOC_ID);
  if (!row || !sameCompany(row as LoanSettings, companyId)) return null;
  return row as LoanSettings;
}

export async function saveLoanSettings(settings: LoanSettings): Promise<string> {
  return upsertDoc(settings.companyId, LOAN_COLLECTIONS.settings, settings.id || LOAN_SETTINGS_DOC_ID, {
    ...settings,
    id: LOAN_SETTINGS_DOC_ID,
  } as unknown as Record<string, unknown>);
}

export function createAuditRow(params: Omit<LoanAuditLog, "id" | "timestamp"> & { timestamp?: string }): LoanAuditLog {
  return {
    id: newLoanDocId("aud"),
    timestamp: params.timestamp || nowIso(),
    ...params,
  };
}
