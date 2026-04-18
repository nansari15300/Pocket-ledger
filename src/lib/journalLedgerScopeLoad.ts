"use client";

/**
 * Compare-before-sync: journal edit ke liye jis company ka voucher hai usi ke party/staff/bank/expense/tax —
 * `useVouchers()` sirf app-header wali company deta hai.
 */
import { collection, getDocs } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { listCompanyDocsFromBrowserDb } from "@/lib/localCompanyDocMirror";
import { isLocalOnlyMode } from "@/lib/localMode";

export type JournalScopedLedgerSnapshot = {
  processedPartiesForSelection: Array<{ id: string; name: string; balance: number }>;
  processedStaff: Array<{ id: string; name: string; balance: number }>;
  processedAccounts: Array<{ id: string; name?: string; accountName?: string; balance: number }>;
  expenseAccounts: Array<{ id: string; name: string; balance: number }>;
  processedTaxes: Array<{ id: string; name: string; balance: number }>;
};

function mergeRowsById<T extends { id: string }>(server: T[], local: T[]): T[] {
  const m = new Map<string, T>();
  server.forEach((r) => m.set(r.id, r));
  local.forEach((r) => m.set(r.id, r));
  return Array.from(m.values());
}

async function mergeWithLocal<T extends { id: string }>(
  companyId: string,
  collectionName: string,
  serverRows: T[],
  mapLocal: (row: Record<string, unknown>) => T | null
): Promise<T[]> {
  if (!isLocalOnlyMode()) return serverRows;
  try {
    const localRows = await listCompanyDocsFromBrowserDb(companyId, collectionName);
    const mapped = localRows
      .map((r) => mapLocal(r as Record<string, unknown>))
      .filter((x): x is T => x != null);
    return mergeRowsById(serverRows, mapped);
  } catch {
    return serverRows;
  }
}

export async function loadJournalLedgerScopeSnapshot(companyId: string): Promise<JournalScopedLedgerSnapshot> {
  const cid = String(companyId || "").trim();
  if (!cid) {
    return {
      processedPartiesForSelection: [],
      processedStaff: [],
      processedAccounts: [],
      expenseAccounts: [],
      processedTaxes: [],
    };
  }

  const partiesSnap = await getDocs(collection(firestore, `companies/${cid}/parties`));
  let processedPartiesForSelection: Array<{ id: string; name: string; balance: number }> = partiesSnap.docs
    .map((d) => {
      const data = d.data() as { name?: string; isDeleted?: boolean; balance?: unknown };
      if (data.isDeleted === true) return null;
      const name = String(data.name || d.id).trim() || d.id;
      return { id: d.id, name, balance: Number(data.balance) || 0 };
    })
    .filter((x): x is NonNullable<typeof x> => x != null);
  processedPartiesForSelection = await mergeWithLocal(cid, "parties", processedPartiesForSelection, (data) => {
    if (data.isDeleted === true) return null;
    const id = String(data.id ?? "");
    if (!id) return null;
    const name = String(data.name || id).trim() || id;
    return { id, name, balance: Number(data.balance) || 0 };
  });

  const staffSnap = await getDocs(collection(firestore, `companies/${cid}/staff`));
  let processedStaff: Array<{ id: string; name: string; balance: number }> = staffSnap.docs
    .map((d) => {
      const data = d.data() as { name?: string; isDeleted?: boolean; balance?: unknown };
      if (data.isDeleted === true) return null;
      const name = String(data.name || d.id).trim() || d.id;
      return { id: d.id, name, balance: Number(data.balance) || 0 };
    })
    .filter((x): x is NonNullable<typeof x> => x != null);
  processedStaff = await mergeWithLocal(cid, "staff", processedStaff, (data) => {
    if (data.isDeleted === true) return null;
    const id = String(data.id ?? "");
    if (!id) return null;
    const name = String(data.name || id).trim() || id;
    return { id, name, balance: Number(data.balance) || 0 };
  });

  const bankSnap = await getDocs(collection(firestore, `companies/${cid}/bank_accounts`));
  let processedAccounts: Array<{ id: string; name?: string; accountName?: string; balance: number }> = bankSnap.docs
    .map((d) => {
      const data = d.data() as { accountName?: string; name?: string; isDeleted?: boolean; balance?: unknown };
      if (data.isDeleted === true) return null;
      const accountName = String(data.accountName || data.name || d.id).trim() || d.id;
      return { id: d.id, accountName, name: accountName, balance: Number(data.balance) || 0 };
    })
    .filter((x): x is NonNullable<typeof x> => x != null);
  processedAccounts = await mergeWithLocal(cid, "bank_accounts", processedAccounts, (data) => {
    if (data.isDeleted === true) return null;
    const id = String(data.id ?? "");
    if (!id) return null;
    const accountName = String(data.accountName || data.name || id).trim() || id;
    return { id, accountName, name: accountName, balance: Number(data.balance) || 0 };
  });

  const expSnap = await getDocs(collection(firestore, `companies/${cid}/expense_accounts`));
  let expenseAccounts: Array<{ id: string; name: string; balance: number }> = expSnap.docs
    .map((d) => {
      const data = d.data() as { name?: string; isDeleted?: boolean; balance?: unknown };
      if (data.isDeleted === true) return null;
      const name = String(data.name || d.id).trim() || d.id;
      return { id: d.id, name, balance: Number(data.balance) || 0 };
    })
    .filter((x): x is NonNullable<typeof x> => x != null);
  expenseAccounts = await mergeWithLocal(cid, "expense_accounts", expenseAccounts, (data) => {
    if (data.isDeleted === true) return null;
    const id = String(data.id ?? "");
    if (!id) return null;
    const name = String(data.name || id).trim() || id;
    return { id, name, balance: Number(data.balance) || 0 };
  });

  const taxSnap = await getDocs(collection(firestore, `companies/${cid}/taxes`));
  let processedTaxes: Array<{ id: string; name: string; balance: number }> = taxSnap.docs
    .map((d) => {
      const data = d.data() as { name?: string; isDeleted?: boolean; balance?: unknown };
      if (data.isDeleted === true) return null;
      const name = String(data.name || d.id).trim() || d.id;
      return { id: d.id, name, balance: Number(data.balance) || 0 };
    })
    .filter((x): x is NonNullable<typeof x> => x != null);
  processedTaxes = await mergeWithLocal(cid, "taxes", processedTaxes, (data) => {
    if (data.isDeleted === true) return null;
    const id = String(data.id ?? "");
    if (!id) return null;
    const name = String(data.name || id).trim() || id;
    return { id, name, balance: Number(data.balance) || 0 };
  });

  return {
    processedPartiesForSelection,
    processedStaff,
    processedAccounts,
    expenseAccounts,
    processedTaxes,
  };
}
