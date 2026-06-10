/**
 * Pure local company — masters SQLite mirror se (Firestore ki jagah).
 */
import type { InterCompanyEntityDetail } from "@/lib/interCompany/interCompanyEntityTypes";
import { listCompanyDocsFromBrowserDb, getCompanyDocFromBrowserDb } from "@/lib/localCompanyDocMirror";

function rowNotDeleted(row: Record<string, unknown>): boolean {
  return row.isDeleted !== true;
}

export async function fetchInterCompanyEntitiesFromLocalMirror(
  companyId: string
): Promise<InterCompanyEntityDetail[]> {
  const cid = String(companyId || "").trim();
  if (!cid) return [];

  const [banks, parties, staff, taxes, expenses] = await Promise.all([
    listCompanyDocsFromBrowserDb(cid, "bank_accounts", { forBackupMerge: true }),
    listCompanyDocsFromBrowserDb(cid, "parties", { forBackupMerge: true }),
    listCompanyDocsFromBrowserDb(cid, "staff", { forBackupMerge: true }),
    listCompanyDocsFromBrowserDb(cid, "taxes", { forBackupMerge: true }),
    listCompanyDocsFromBrowserDb(cid, "expense_accounts", { forBackupMerge: true }),
  ]);

  const rows: InterCompanyEntityDetail[] = [];

  for (const raw of banks) {
    const d = raw as Record<string, unknown>;
    if (!rowNotDeleted(d)) continue;
    rows.push({
      id: String(d.id || ""),
      kind: "bank",
      label: String(d.accountName || d.id || ""),
      bankName: d.bankName as string | undefined,
      accountNumber: d.accountNumber as string | undefined,
      phone: d.phone as string | undefined,
      interCompanyAccountNo: d.interCompanyAccountNo as string | undefined,
    });
  }

  for (const raw of parties) {
    const d = raw as Record<string, unknown>;
    if (!rowNotDeleted(d)) continue;
    rows.push({
      id: String(d.id || ""),
      kind: "party",
      label: String(d.name || d.id || ""),
      phone: d.phone as string | undefined,
      email: d.email as string | undefined,
      address: d.address as string | undefined,
      pan: d.pan as string | undefined,
      fileUrl: (d.fileUrl as string | null | undefined) ?? null,
      openingBalance: d.openingBalance as number | undefined,
      interCompanyAccountNo: d.interCompanyAccountNo as string | undefined,
    });
  }

  for (const raw of staff) {
    const d = raw as Record<string, unknown>;
    if (!rowNotDeleted(d)) continue;
    rows.push({
      id: String(d.id || ""),
      kind: "staff",
      label: String(d.name || d.id || ""),
      phone: d.phone as string | undefined,
      email: d.email as string | undefined,
      pan: d.pan as string | undefined,
      fileUrl: (d.fileUrl as string | null | undefined) ?? null,
      interCompanyAccountNo: d.interCompanyAccountNo as string | undefined,
    });
  }

  for (const raw of taxes) {
    const d = raw as Record<string, unknown>;
    if (!rowNotDeleted(d)) continue;
    rows.push({
      id: String(d.id || ""),
      kind: "tax",
      label: String(d.name || d.id || ""),
      interCompanyAccountNo: d.interCompanyAccountNo as string | undefined,
    });
  }

  for (const raw of expenses) {
    const d = raw as Record<string, unknown>;
    if (!rowNotDeleted(d)) continue;
    rows.push({
      id: String(d.id || ""),
      kind: "expense",
      label: String(d.name || d.id || ""),
      interCompanyAccountNo: d.interCompanyAccountNo as string | undefined,
    });
  }

  return rows.filter((r) => r.id);
}

export async function fetchInterCompanyBankEntityDetailFromLocalMirror(
  companyId: string,
  bankAccountId: string
): Promise<InterCompanyEntityDetail | null> {
  const cid = String(companyId || "").trim();
  const bid = String(bankAccountId || "").trim();
  if (!cid || !bid) return null;
  const data = await getCompanyDocFromBrowserDb(cid, "bank_accounts", bid);
  if (!data || (data as Record<string, unknown>).isDeleted === true) return null;
  const d = data as Record<string, unknown>;
  return {
    id: bid,
    kind: "bank",
    label: String(d.accountName || bid),
    bankName: d.bankName as string | undefined,
    accountNumber: d.accountNumber as string | undefined,
    phone: d.phone as string | undefined,
    interCompanyAccountNo: d.interCompanyAccountNo as string | undefined,
  };
}
