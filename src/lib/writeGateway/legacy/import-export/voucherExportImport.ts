"use client";

import * as XLSX from "xlsx";
import { collection, getDocs, query, addDoc, serverTimestamp } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import type { EntityColumn } from "@/lib/import-export/entityConfig";
import { sheetToRowsWithColumns } from "@/lib/import-export/excelUtils";

/** Voucher tabs: sheet name + types in that tab (Type column shows which). */
export const VOUCHER_SHEETS: { sheetName: string; types: string[] }[] = [
  { sheetName: "Sale_Purchase", types: ["sale", "purchase"] },
  { sheetName: "Payment", types: ["payment_in", "payment_out"] },
  { sheetName: "Quotation", types: ["quotation"] },
  { sheetName: "Journal", types: ["journal"] },
  { sheetName: "Contra", types: ["contra"] },
  { sheetName: "Income_Expense", types: ["direct_income", "direct_expense"] },
];

/** Columns for every voucher sheet (Date, Voucher No., Type, Dr Account, Cr Account, Narration, Amount). */
export const VOUCHER_COLUMNS: EntityColumn[] = [
  { key: "date", header: "Date", required: true },
  { key: "voucherNumber", header: "Voucher No.", required: true },
  { key: "voucherType", header: "Type", required: true },
  { key: "drAccount", header: "Dr Account", required: true },
  { key: "crAccount", header: "Cr Account", required: true },
  { key: "narration", header: "Narration" },
  { key: "amount", header: "Amount", required: true, format: (v) => (v == null ? 0 : Number(v)) },
];

function toDateStr(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (v && typeof (v as { toDate?: () => Date }).toDate === "function") {
    return (v as { toDate: () => Date }).toDate().toISOString().slice(0, 10);
  }
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
}

function voucherToRow(v: Record<string, unknown>, names: Record<string, string>): Record<string, unknown> {
  const type = String(v.type ?? "");
  let dr = "";
  let cr = "";
  if (type === "sale" || type === "quotation") {
    dr = names[`parties:${v.partyId}`] ?? String(v.partyId ?? "");
    cr = v.fromAccountId ? (names[`bank_accounts:${v.fromAccountId}`] ?? String(v.fromAccountId)) : "Sales";
  } else if (type === "purchase") {
    dr = v.fromAccountId ? (names[`bank_accounts:${v.fromAccountId}`] ?? String(v.fromAccountId)) : "Purchase";
    cr = names[`parties:${v.partyId}`] ?? String(v.partyId ?? "");
  } else if (type === "payment_in" || type === "direct_income") {
    dr = v.fromAccountId ? (names[`bank_accounts:${v.fromAccountId}`] ?? String(v.fromAccountId)) : "";
    cr = v.partyId ? (names[`parties:${v.partyId}`] ?? String(v.partyId)) : v.incomeAccountId ? (names[`expense_accounts:${v.incomeAccountId}`] ?? String(v.incomeAccountId)) : "";
  } else if (type === "payment_out" || type === "direct_expense") {
    dr = v.partyId ? (names[`parties:${v.partyId}`] ?? String(v.partyId)) : v.expenseAccountId ? (names[`expense_accounts:${v.expenseAccountId}`] ?? String(v.expenseAccountId)) : v.staffId ? (names[`staff:${v.staffId}`] ?? String(v.staffId)) : "";
    cr = v.fromAccountId ? (names[`bank_accounts:${v.fromAccountId}`] ?? String(v.fromAccountId)) : "";
  } else if (type === "contra") {
    dr = v.toAccountId ? (names[`bank_accounts:${v.toAccountId}`] ?? String(v.toAccountId)) : "";
    cr = v.fromAccountId ? (names[`bank_accounts:${v.fromAccountId}`] ?? String(v.fromAccountId)) : "";
  } else {
    dr = v.partyId ? (names[`parties:${v.partyId}`] ?? String(v.partyId)) : "";
    cr = v.fromAccountId ? (names[`bank_accounts:${v.fromAccountId}`] ?? String(v.fromAccountId)) : "";
  }
  return {
    date: toDateStr(v.date),
    voucherNumber: v.voucherNumber ?? v.id,
    voucherType: v.type ?? "",
    drAccount: dr,
    crAccount: cr,
    narration: v.narration ?? "",
    amount: Number(v.amount ?? v.total ?? 0),
  };
}

/** Export vouchers by tab: Sale_Purchase, Payment, Quotation, Journal, Contra, Income_Expense. */
export async function exportVouchersByTabs(
  companyId: string
): Promise<{ sheetName: string; rows: Record<string, unknown>[] }[]> {
  const base = `companies/${companyId}`;
  const vouchersSnap = await getDocs(query(collection(firestore, `${base}/vouchers`)));
  const vouchers = vouchersSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as Record<string, unknown>[];

  const names: Record<string, string> = {};
  const partiesSnap = await getDocs(collection(firestore, `${base}/parties`));
  partiesSnap.docs.forEach((d) => {
    names[`parties:${d.id}`] = (d.data() as { name?: string }).name ?? d.id;
  });
  const accountsSnap = await getDocs(collection(firestore, `${base}/bank_accounts`));
  accountsSnap.docs.forEach((d) => {
    names[`bank_accounts:${d.id}`] = (d.data() as { accountName?: string }).accountName ?? d.id;
  });
  const staffSnap = await getDocs(collection(firestore, `${base}/staff`));
  staffSnap.docs.forEach((d) => {
    names[`staff:${d.id}`] = (d.data() as { name?: string }).name ?? d.id;
  });
  const expenseSnap = await getDocs(collection(firestore, `${base}/expense_accounts`));
  expenseSnap.docs.forEach((d) => {
    names[`expense_accounts:${d.id}`] = (d.data() as { name?: string }).name ?? d.id;
  });

  const typeSet = (types: string[]) => new Set(types);
  return VOUCHER_SHEETS.map(({ sheetName, types }) => {
    const allowed = typeSet(types);
    const rows = vouchers
      .filter((v) => allowed.has(String(v.type ?? "")))
      .map((v) => voucherToRow(v, names));
    return { sheetName, rows };
  });
}

/** Legacy single-sheet export (kept for compatibility). */
export async function exportVouchers(companyId: string): Promise<Record<string, unknown>[]> {
  const tabs = await exportVouchersByTabs(companyId);
  return tabs.flatMap((t) => t.rows);
}

/** One example row per tab for template. */
export function buildVoucherTemplateSheets(): { sheetName: string; rows: Record<string, unknown>[] }[] {
  return VOUCHER_SHEETS.map(({ sheetName, types }) => ({
    sheetName,
    rows: [
      {
        date: "2024-01-01",
        voucherNumber: "V-001",
        voucherType: types[0],
        drAccount: "Party or Bank Name",
        crAccount: "Bank or Party Name",
        narration: "",
        amount: 0,
      },
    ],
  }));
}

const VOUCHER_SHEET_NAMES = new Set(VOUCHER_SHEETS.map((s) => s.sheetName));

/** Parse voucher workbook: all known tabs (Sale_Purchase, Payment, etc.) into one rows array. */
export function parseVoucherWorkbook(file: File): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!data) {
          reject(new Error("Failed to read file"));
          return;
        }
        const wb = XLSX.read(data, { type: "binary" });
        const allRows: Record<string, unknown>[] = [];
        for (const sheetName of wb.SheetNames) {
          if (!VOUCHER_SHEET_NAMES.has(sheetName)) continue;
          const ws = wb.Sheets[sheetName];
          const rows = sheetToRowsWithColumns(ws, VOUCHER_COLUMNS);
          allRows.push(...rows);
        }
        resolve(allRows);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsBinaryString(file);
  });
}

/** Resolve account name to id from parties, bank_accounts, staff, expense_accounts. */
export async function resolveAccountNameToId(
  companyId: string,
  name: string
): Promise<{ kind: "party" | "bank" | "staff" | "expense"; id: string } | null> {
  const base = `companies/${companyId}`;
  const n = String(name ?? "").trim().toLowerCase();
  if (!n) return null;
  const collections = [
    { col: "parties", nameKey: "name", kind: "party" as const },
    { col: "bank_accounts", nameKey: "accountName", kind: "bank" as const },
    { col: "staff", nameKey: "name", kind: "staff" as const },
    { col: "expense_accounts", nameKey: "name", kind: "expense" as const },
  ];
  for (const { col, nameKey, kind } of collections) {
    const snap = await getDocs(query(collection(firestore, `${base}/${col}`)));
    const found = snap.docs.find((d) => String((d.data() as Record<string, string>)[nameKey] ?? "").trim().toLowerCase() === n);
    if (found) return { kind, id: found.id };
  }
  return null;
}

/** Create voucher from imported row (date, voucherNo, voucherType, drAccount, crAccount, narration, amount). */
export async function importVouchers(
  companyId: string,
  ownerId: string,
  rows: Record<string, unknown>[]
): Promise<{ created: number }> {
  const base = `companies/${companyId}`;
  const vouchersRef = collection(firestore, `${base}/vouchers`);
  let created = 0;
  for (const row of rows) {
    const voucherType = String(row.voucherType ?? "").trim().toLowerCase();
    const drName = String(row.drAccount ?? "").trim();
    const crName = String(row.crAccount ?? "").trim();
    const amount = Number(row.amount ?? 0);
    if (!voucherType || (!drName && !crName)) continue;
    const dr = drName ? await resolveAccountNameToId(companyId, drName) : null;
    const cr = crName ? await resolveAccountNameToId(companyId, crName) : null;
    const docData: Record<string, unknown> = {
      type: voucherType,
      voucherNumber: row.voucherNumber ?? "",
      date: row.date ? new Date(String(row.date)) : new Date(),
      narration: row.narration ?? "",
      amount,
      total: amount,
      subTotal: amount,
      companyId,
      ownerId,
      userId: ownerId,
      lineItems: [],
      debit: 0,
      credit: 0,
    };
    if (voucherType === "sale" || voucherType === "quotation" || voucherType === "purchase") {
      docData.partyId = (dr?.kind === "party" ? dr.id : cr?.kind === "party" ? cr.id : null) ?? null;
      docData.fromAccountId = (dr?.kind === "bank" ? dr.id : cr?.kind === "bank" ? cr.id : null) ?? null;
    } else if (voucherType === "payment_in" || voucherType === "direct_income") {
      docData.fromAccountId = (dr?.kind === "bank" ? dr.id : null) ?? null;
      docData.partyId = (cr?.kind === "party" ? cr.id : null) ?? null;
      docData.incomeAccountId = (cr?.kind === "expense" ? cr.id : null) ?? null;
    } else if (voucherType === "payment_out" || voucherType === "direct_expense") {
      docData.partyId = (dr?.kind === "party" ? dr.id : null) ?? null;
      docData.staffId = (dr?.kind === "staff" ? dr.id : null) ?? null;
      docData.expenseAccountId = (dr?.kind === "expense" ? dr.id : null) ?? null;
      docData.fromAccountId = (cr?.kind === "bank" ? cr.id : null) ?? null;
    } else if (voucherType === "contra") {
      docData.fromAccountId = (cr?.kind === "bank" ? cr.id : null) ?? null;
      docData.toAccountId = (dr?.kind === "bank" ? dr.id : null) ?? null;
    } else {
      docData.partyId = (dr?.kind === "party" ? dr.id : cr?.kind === "party" ? cr.id : null) ?? null;
      docData.fromAccountId = (dr?.kind === "bank" ? dr.id : cr?.kind === "bank" ? cr.id : null) ?? null;
    }
    await addDoc(vouchersRef, { ...docData, createdAt: serverTimestamp() });
    created++;
  }
  return { created };
}
