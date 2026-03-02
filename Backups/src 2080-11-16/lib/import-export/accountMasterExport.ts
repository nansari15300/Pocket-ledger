"use client";

import { collection, getDocs, query, doc, setDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";

function toDateStr(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (v && typeof (v as { toDate?: () => Date }).toDate === "function") {
    return (v as { toDate: () => Date }).toDate().toISOString().slice(0, 10);
  }
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
}

function flatRow(
  type: string,
  name: string,
  groupName: string,
  openingBalance: number,
  openingBalanceDate: string,
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    type,
    name,
    groupName,
    openingBalance,
    openingBalanceDate,
    ...extra,
  };
}

export async function exportAccountMaster(companyId: string): Promise<Record<string, unknown>[]> {
  const base = `companies/${companyId}`;
  const rows: Record<string, unknown>[] = [];

  const groupNames = async (col: string): Promise<Record<string, string>> => {
    const snap = await getDocs(query(collection(firestore, `${base}/${col}`)));
    const out: Record<string, string> = {};
    snap.docs.forEach((d) => {
      out[d.id] = (d.data() as { name?: string }).name ?? d.id;
    });
    return out;
  };

  const groups = await groupNames("groups");
  const partiesSnap = await getDocs(query(collection(firestore, `${base}/parties`)));
  partiesSnap.docs.forEach((d) => {
    const data = d.data() as Record<string, unknown>;
    rows.push(
      flatRow(
        "Party",
        String(data.name ?? d.id),
        data.groupId ? (groups[String(data.groupId)] ?? String(data.groupId)) : "",
        Number(data.openingBalance ?? 0),
        toDateStr(data.openingBalanceDate),
        {
          address: data.address ?? "",
          phone: data.phone ?? "",
          email: data.email ?? "",
          pan: data.pan ?? "",
        }
      )
    );
  });

  const accountGroups = await groupNames("account_groups");
  const bankSnap = await getDocs(query(collection(firestore, `${base}/bank_accounts`)));
  bankSnap.docs.forEach((d) => {
    const data = d.data() as Record<string, unknown>;
    rows.push(
      flatRow(
        "Bank",
        String(data.accountName ?? d.id),
        data.groupId ? (accountGroups[String(data.groupId)] ?? String(data.groupId)) : "",
        Number(data.openingBalance ?? 0),
        toDateStr(data.openingBalanceDate),
        {
          accountType: data.accountType ?? "Bank",
          bankName: data.bankName ?? "",
          accountNumber: data.accountNumber ?? "",
          ifscCode: data.ifscCode ?? "",
        }
      )
    );
  });

  const staffGroups = await groupNames("staff_groups");
  const staffSnap = await getDocs(query(collection(firestore, `${base}/staff`)));
  staffSnap.docs.forEach((d) => {
    const data = d.data() as Record<string, unknown>;
    rows.push(
      flatRow(
        "Staff",
        String(data.name ?? d.id),
        data.groupId ? (staffGroups[String(data.groupId)] ?? String(data.groupId)) : "",
        Number(data.openingBalance ?? 0),
        toDateStr(data.openingBalanceDate),
        {
          email: data.email ?? "",
          phone: data.phone ?? "",
          address: data.address ?? "",
          salary: data.salary ?? "",
          salaryPeriod: data.salaryPeriod ?? "",
        }
      )
    );
  });

  const taxGroups = await groupNames("tax_groups");
  const taxesSnap = await getDocs(query(collection(firestore, `${base}/taxes`)));
  taxesSnap.docs.forEach((d) => {
    const data = d.data() as Record<string, unknown>;
    rows.push(
      flatRow(
        "Tax",
        String(data.name ?? d.id),
        data.groupId ? (taxGroups[String(data.groupId)] ?? String(data.groupId)) : "",
        0,
        "",
        { rate: data.rate ?? 0 }
      )
    );
  });

  const itemGroups = await groupNames("item_groups");
  const itemsSnap = await getDocs(query(collection(firestore, `${base}/items`)));
  itemsSnap.docs.forEach((d) => {
    const data = d.data() as Record<string, unknown>;
    rows.push(
      flatRow(
        "Items",
        String(data.name ?? d.id),
        data.groupId ? (itemGroups[String(data.groupId)] ?? String(data.groupId)) : "",
        Number(data.openingBalance ?? 0),
        toDateStr(data.openingBalanceDate),
        {
          itemType: data.type ?? "item",
          salePrice: data.salePrice ?? 0,
          purchasePrice: data.purchasePrice ?? 0,
          openingBalanceUnit: data.openingBalanceUnit ?? "",
          lowStockWarning: data.lowStockWarning ?? "",
        }
      )
    );
  });

  const expenseGroups = await groupNames("expense_groups");
  const expenseSnap = await getDocs(query(collection(firestore, `${base}/expense_accounts`)));
  expenseSnap.docs.forEach((d) => {
    const data = d.data() as Record<string, unknown>;
    const type = data.type === "Income" ? "Income" : "Expense";
    rows.push(
      flatRow(
        type,
        String(data.name ?? d.id),
        data.groupId ? (expenseGroups[String(data.groupId)] ?? String(data.groupId)) : "",
        Number(data.openingBalance ?? 0),
        toDateStr(data.openingBalanceDate),
        {}
      )
    );
  });

  return rows;
}

export function buildAccountMasterTemplateRow(): Record<string, unknown> {
  return {
    type: "Party",
    name: "Example Name",
    groupName: "My Group",
    openingBalance: 0,
    openingBalanceDate: "",
    address: "",
    phone: "",
    email: "",
    pan: "",
    accountType: "Bank",
    bankName: "",
    accountNumber: "",
    ifscCode: "",
    salary: "",
    salaryPeriod: "",
    rate: 0,
    itemType: "item",
    salePrice: 0,
    purchasePrice: 0,
    openingBalanceUnit: "",
    lowStockWarning: "",
  };
}

function toDateVal(v: unknown): Date | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return v;
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d;
}

/** Build Firestore doc for one account row by type. */
export function buildAccountDocFromRow(
  type: string,
  row: Record<string, unknown>,
  groupId: string | undefined,
  companyId: string,
  ownerId: string
): Record<string, unknown> {
  const base = {
    companyId,
    ownerId,
    debit: 0,
    credit: 0,
    balance: 0,
    groupId: groupId ?? undefined,
    openingBalance: Number(row.openingBalance ?? 0),
    openingBalanceDate: toDateVal(row.openingBalanceDate) ?? null,
  };
  const t = String(type).trim().toLowerCase();
  const name = String(row.name ?? "").trim();
  if (t === "party") {
    return {
      ...base,
      name,
      address: row.address ?? "",
      phone: row.phone ?? "",
      email: row.email ?? "",
      pan: row.pan ?? "",
    };
  }
  if (t === "bank") {
    return {
      ...base,
      accountName: name,
      accountType: (row.accountType as string) === "Cash" ? "Cash" : "Bank",
      bankName: row.bankName ?? "",
      accountNumber: row.accountNumber ?? "",
      ifscCode: row.ifscCode ?? "",
    };
  }
  if (t === "staff") {
    return {
      ...base,
      name,
      email: row.email ?? "",
      phone: row.phone ?? "",
      address: row.address ?? "",
      salary: Number(row.salary) || 0,
      salaryPeriod: row.salaryPeriod ?? "",
    };
  }
  if (t === "tax") {
    return {
      ...base,
      name,
      rate: Number(row.rate) || 0,
    };
  }
  if (t === "items") {
    return {
      ...base,
      name,
      type: (row.itemType as string) || "item",
      salePrice: Number(row.salePrice) || 0,
      purchasePrice: Number(row.purchasePrice) || 0,
      openingBalanceUnit: row.openingBalanceUnit ?? "",
      lowStockWarning: row.lowStockWarning != null && row.lowStockWarning !== "" ? Number(row.lowStockWarning) : undefined,
    };
  }
  if (t === "income" || t === "expense") {
    return {
      ...base,
      name,
      type: t === "income" ? "Income" : "Expense",
    };
  }
  return base;
}
