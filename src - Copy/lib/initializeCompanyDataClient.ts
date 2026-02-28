"use client";

import { doc, getDoc, updateDoc, serverTimestamp, writeBatch } from "firebase/firestore";
import { firestore } from "@/lib/firebase";

const DEFAULT_VOUCHER_SETTINGS = {
  autoVoucherNumbering: {
    sale: true, sale_service: true, purchase: true, purchase_service: true,
    payment_in: true, payment_out: true, contra: true, direct_income: true,
    direct_expense: true, journal: true, note: true, add_salary: true, pay_salary: true,
  },
  allowVoucherNumberEditing: {
    sale: false, sale_service: false, purchase: false, purchase_service: false,
    payment_in: false, payment_out: false, contra: false, direct_income: false,
    direct_expense: false, journal: false, note: false, add_salary: false, pay_salary: false,
  },
  allowRateEditing: { sale: true, purchase: true },
  voucherPrefixes: {
    sale: ["Sale Inv"], sale_service: ["SS-"], purchase: ["PUR-"], purchase_service: ["PS-"],
    payment_in: ["RCPT-"], payment_out: ["PYMT-"], contra: ["CNTR-"], direct_income: ["DINC-"],
    direct_expense: ["DEXP-"], journal: ["JRNL-"], note: ["NOTE-"], add_salary: ["ADD-SAL-"], pay_salary: ["PYSAL-"],
  },
  enableVoucherPrefixSelection: {
    sale: false, sale_service: false, purchase: false, purchase_service: false,
    payment_in: false, payment_out: false, contra: false, direct_income: false,
    direct_expense: false, journal: false, note: false, add_salary: false, pay_salary: false,
  },
  enableLinkPaymentToTxns: true,
};

/**
 * Client-only: Creates default groups, accounts, and company settings for a new company.
 * Must run in browser so Firestore uses the signed-in user's auth (server action has no auth).
 */
export async function initializeCompanyDataClient(companyId: string, userId: string): Promise<void> {
  const batch = writeBatch(firestore);

  const groupsToCreate = [
    { col: "groups", id: "assets", name: "Assets", type: "Asset", isSystemReserved: true, isReportOnly: true },
    { col: "groups", id: "liabilities", name: "Liabilities", type: "Liability", isSystemReserved: true, isReportOnly: true },
    { col: "groups", id: "income", name: "Income", type: "Income", isSystemReserved: true, isReportOnly: true },
    { col: "groups", id: "expenses", name: "Expenses", type: "Expense", isSystemReserved: true, isReportOnly: true },
    { col: "groups", id: "equity", name: "Equity", type: "Equity", isSystemReserved: true, isReportOnly: true },
    { col: "groups", id: "sundry_debtors", name: "Sundry Debtors", type: "Asset", parentId: "assets", isSystemReserved: true, isReportOnly: false },
    { col: "groups", id: "sundry_creditors", name: "Sundry Creditors", type: "Liability", parentId: "liabilities", isSystemReserved: true, isReportOnly: false },
    { col: "tax_groups", id: "duties_taxes", name: "Duties & Taxes", type: "Tax", parentId: "liabilities", isSystemReserved: true, isReportOnly: false },
    { col: "account_groups", id: "bank_accounts_group", name: "Bank Accounts", type: "Bank", parentId: "assets", isSystemReserved: true, isReportOnly: false },
    { col: "account_groups", id: "cash_in_hand_group", name: "Cash-in-Hand", type: "Cash", parentId: "assets", isSystemReserved: true, isReportOnly: false },
    { col: "expense_groups", id: "direct_income", name: "Direct Income", type: "Income", parentId: "income", isSystemReserved: true, isReportOnly: false },
    { col: "expense_groups", id: "indirect_income", name: "Indirect Income", type: "Income", parentId: "income", isSystemReserved: true, isReportOnly: false },
    { col: "expense_groups", id: "direct_expense", name: "Direct Expenses", type: "Expense", parentId: "expenses", isSystemReserved: true, isReportOnly: false },
    { col: "expense_groups", id: "indirect_expense", name: "Indirect Expenses", type: "Expense", parentId: "expenses", isSystemReserved: true, isReportOnly: false },
    { col: "staff_groups", id: "loans_liabilities", name: "Loans & Liabilities", type: "Liability", parentId: "liabilities", isSystemReserved: true, isReportOnly: false },
  ];

  groupsToCreate.forEach((g) => {
    const ref = doc(firestore, `companies/${companyId}/${g.col}`, g.id);
    batch.set(ref, {
      name: g.name,
      type: g.type,
      parentId: (g as { parentId?: string }).parentId ?? null,
      companyId,
      ownerId: userId,
      isDeleted: false,
      isSystemReserved: g.isSystemReserved ?? false,
      isReportOnly: (g as { isReportOnly?: boolean }).isReportOnly ?? false,
      createdAt: serverTimestamp(),
    });
  });

  const accountsToCreate = [
    { col: "parties", id: "owners_capital", name: "Owner's Capital", groupId: "equity", isSystemReserved: true },
    { col: "parties", id: "opening_balance_ledger", name: "Opening Balance", groupId: "equity", isSystemReserved: true, isSystemAccount: true },
    { col: "taxes", id: "vat_sales_tax", name: "VAT / Sales Tax", groupId: "duties_taxes", rate: 13, isSystemReserved: true },
    { col: "expense_accounts", id: "sales_account", name: "Sales Account", groupId: "direct_income", type: "Income", isSystemReserved: true },
    { col: "expense_accounts", id: "purchase_account", name: "Purchase Account", groupId: "direct_expense", type: "Expense", isSystemReserved: true },
    { col: "expense_accounts", id: "salary_account", name: "Salary Account", groupId: "indirect_expense", type: "Expense", isSystemReserved: true },
  ];

  accountsToCreate.forEach((acc) => {
    const ref = doc(firestore, `companies/${companyId}/${acc.col}`, acc.id);
    batch.set(ref, {
      name: acc.name,
      groupId: acc.groupId,
      accountType: (acc as { accountType?: string }).accountType ?? null,
      type: (acc as { type?: string }).type ?? null,
      rate: (acc as { rate?: number }).rate ?? 0,
      openingBalance: 0,
      openingBalanceDate: null,
      companyId,
      ownerId: userId,
      isDeleted: false,
      isSystemReserved: acc.isSystemReserved ?? false,
      isSystemAccount: (acc as { isSystemAccount?: boolean }).isSystemAccount ?? false,
      createdAt: serverTimestamp(),
    });
  });

  const itemGroupsToCreate = [
    { id: "stock_items", name: "Stock Items" },
    { id: "services", name: "Services" },
  ];

  itemGroupsToCreate.forEach((ig) => {
    const ref = doc(firestore, `companies/${companyId}/item_groups`, ig.id);
    batch.set(ref, {
      name: ig.name,
      companyId,
      ownerId: userId,
      isDeleted: false,
      isSystemReserved: true,
      debit: 0,
      credit: 0,
      balance: 0,
      createdAt: serverTimestamp(),
    });
  });

  await batch.commit();

  const companyRef = doc(firestore, "companies", companyId);
  const companySnap = await getDoc(companyRef);
  if (!companySnap.exists()) {
    throw new Error("Company not yet on server – will retry when synced.");
  }
  try {
    await updateDoc(companyRef, { ...DEFAULT_VOUCHER_SETTINGS });
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    if (err?.code === "not-found" || (typeof err?.message === "string" && err.message.includes("No document to update"))) {
      throw new Error("Company not yet on server – will retry when synced.");
    }
    throw e;
  }
}
