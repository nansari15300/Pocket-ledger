"use client";

import { doc, serverTimestamp, writeBatch } from "firebase/firestore";
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
  const companyRef = doc(firestore, "companies", companyId);

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
    // Intentionally do NOT auto-create Income & Expense groups; they must be user-created.
    { col: "staff_groups", id: "loans_liabilities", name: "Loans & Liabilities", type: "Liability", parentId: "liabilities", isSystemReserved: true, isReportOnly: false },
    // Auto-created Ungrouped buckets (kept hidden in UI lists unless real ungrouped records exist).
    { col: "groups", id: "ungrouped_party", name: "Ungrouped", type: "General", isSystemReserved: false, isReportOnly: false, isAutoUngrouped: true },
    { col: "staff_groups", id: "ungrouped_staff", name: "Ungrouped", type: "General", parentId: "loans_liabilities", isSystemReserved: false, isReportOnly: false, isAutoUngrouped: true },
    { col: "tax_groups", id: "ungrouped_tax", name: "Ungrouped", type: "General", parentId: "duties_taxes", isSystemReserved: false, isReportOnly: false, isAutoUngrouped: true },
    { col: "account_groups", id: "ungrouped_account", name: "Ungrouped", type: "General", parentId: "bank_accounts_group", isSystemReserved: false, isReportOnly: false, isAutoUngrouped: true },
    // Intentionally skip auto-created ungrouped expense group since Income/Expense groups are manual now.
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
      // Flag auto-created Ungrouped docs so UI can hide base row until needed.
      isAutoUngrouped: (g as { isAutoUngrouped?: boolean }).isAutoUngrouped ?? false,
      createdAt: serverTimestamp(),
    });
  });

  const accountsToCreate = [
    { col: "parties", id: "owners_capital", name: "Owner's Capital", groupId: "equity", isSystemReserved: true },
    { col: "parties", id: "opening_balance_ledger", name: "Opening Balance", groupId: "equity", isSystemReserved: true, isSystemAccount: true },
    { col: "taxes", id: "vat_sales_tax", name: "VAT / Sales Tax", groupId: "duties_taxes", rate: 13, isSystemReserved: true },
    // Intentionally do NOT auto-create Income & Expense accounts; they must be user-created.
  ];

  accountsToCreate.forEach((acc) => {
    const ref = doc(firestore, `companies/${companyId}/${acc.col}`, acc.id);
    batch.set(ref, {
      name: acc.name,
      groupId: acc.groupId,
      accountType: (acc as { accountType?: string }).accountType ?? null,
      type: (acc as { type?: string }).type ?? null,
      defaultVoucherTypes: (acc as { defaultVoucherTypes?: string[] }).defaultVoucherTypes ?? [],
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
    { id: "ungrouped_item", name: "Ungrouped", isAutoUngrouped: true },
  ];

  itemGroupsToCreate.forEach((ig) => {
    const ref = doc(firestore, `companies/${companyId}/item_groups`, ig.id);
    batch.set(ref, {
      name: ig.name,
      companyId,
      ownerId: userId,
      isDeleted: false,
      isSystemReserved: (ig as { isAutoUngrouped?: boolean }).isAutoUngrouped ? false : true,
      isAutoUngrouped: (ig as { isAutoUngrouped?: boolean }).isAutoUngrouped ?? false,
      debit: 0,
      credit: 0,
      balance: 0,
      createdAt: serverTimestamp(),
    });
  });

  batch.update(companyRef, { ...DEFAULT_VOUCHER_SETTINGS });

  await batch.commit();
}
