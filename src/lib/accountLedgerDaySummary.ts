/**
 * Bank/Cash day figures — same Dr/Cr rules as account ledger (`useTransactions` account context).
 * Daybook Daily Summary isko use karta hai taaki opening / today in-out / closing bank ledger se match kare.
 */
import { endOfDay, startOfDay } from "date-fns";
import {
  getInterCompanyLedgerAmounts,
  hideUnapprovedTargetInterCompanyEntityLedger,
  interCompanyPaymentDirection,
} from "@/lib/interCompany/interCompanyLedgerAmounts";
import { interCompanyVoucherViewerSide } from "@/lib/interCompany/interCompanyVoucherHydrate";
import { sumJournalAmountsForAccount } from "@/lib/journalLedgerAmounts";

export type DaybookAccountSummaryRow = {
  id: string;
  name: string;
  yesterday: number;
  in: number;
  out: number;
  today: number;
};

export type DaybookDailySummary = {
  bank: { yesterday: number; in: number; out: number; today: number };
  cash: { yesterday: number; in: number; out: number; today: number };
  total: { yesterday: number; in: number; out: number; today: number };
  bankAccounts: DaybookAccountSummaryRow[];
  cashAccounts: DaybookAccountSummaryRow[];
};

export type DaybookSummaryAccountInput = {
  id: string;
  accountName?: string;
  accountType?: string;
  openingBalance?: number;
  openingBalanceDate?: unknown;
  isDeleted?: boolean;
};

/** Optional — client daybook should pass `getTransactionAmounts(..., "account")` so math === bank ledger. */
export type AccountLedgerAmountsFn = (
  transaction: any,
  accountId: string
) => { debit: number; credit: number };

/** Same shapes as ledger `parseFirestoreDateFieldToJsDate` — bina "use client" import. */
function safeToDate(date: unknown): Date | null {
  if (date == null) return null;
  if (date instanceof Date) return isNaN(date.getTime()) ? null : date;
  if (typeof date === "string" && date.trim()) {
    const d = new Date(date);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof date === "number" && Number.isFinite(date)) {
    const d = new Date(date);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof date === "object" && date !== null) {
    const o = date as {
      toDate?: () => Date;
      seconds?: unknown;
      _seconds?: unknown;
      nanoseconds?: unknown;
      _nanoseconds?: unknown;
    };
    if (typeof o.toDate === "function") {
      try {
        const d = o.toDate();
        return d instanceof Date && !isNaN(d.getTime()) ? d : null;
      } catch {
        return null;
      }
    }
    const sec =
      typeof o.seconds === "number" && Number.isFinite(o.seconds)
        ? o.seconds
        : typeof o._seconds === "number" && Number.isFinite(o._seconds)
          ? o._seconds
          : null;
    if (sec !== null) {
      const ns =
        typeof o.nanoseconds === "number" && Number.isFinite(o.nanoseconds)
          ? o.nanoseconds
          : typeof o._nanoseconds === "number" && Number.isFinite(o._nanoseconds)
            ? o._nanoseconds
            : 0;
      const d = new Date(sec * 1000 + ns / 1e6);
      return isNaN(d.getTime()) ? null : d;
    }
  }
  return null;
}

function toNum(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const n = Number(value.replace(/,/g, "").trim());
    return Number.isFinite(n) ? n : 0;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function ledgerIdEq(value: unknown, id: string): boolean {
  const target = String(id || "").trim();
  if (!target || value == null || value === "") return false;
  if (typeof value === "object" && value !== null && "id" in (value as Record<string, unknown>)) {
    return String((value as { id?: unknown }).id ?? "").trim() === target;
  }
  return String(value).trim() === target;
}

/** Ledger amount: `amount || total` — `total: 0` + real `amount` pe `??` galat 0 de deta hai. */
export function voucherLedgerAmount(transaction: any): number {
  return toNum(transaction?.amount || transaction?.total || 0);
}

/** Account ledger Dr/Cr — `getTransactionAmounts(..., "account")` + IC overwrite. */
export function getAccountLedgerTransactionAmounts(
  transaction: any,
  accountId: string
): { debit: number; credit: number } {
  let debit = 0;
  let credit = 0;
  const entityId = String(accountId || "").trim();
  if (!entityId || !transaction) return { debit, credit };

  if (hideUnapprovedTargetInterCompanyEntityLedger(transaction, "account", entityId)) {
    return { debit: 0, credit: 0 };
  }

  const amount = voucherLedgerAmount(transaction);

  if (ledgerIdEq(transaction.accountId, entityId)) {
    if (["payment_in", "direct_income", "sale"].includes(transaction.type)) debit += amount;
    if (["payment_out", "direct_expense", "purchase"].includes(transaction.type)) credit += amount;
  }

  if (transaction.type === "contra") {
    const hasToAccount = transaction.toAccountId != null && transaction.toAccountId !== "";
    const hasFromAccount = transaction.fromAccountId != null && transaction.fromAccountId !== "";
    const matchesToAccount =
      ledgerIdEq(transaction.toAccountId, entityId) ||
      (!hasToAccount && (ledgerIdEq(transaction.accountId, entityId) || ledgerIdEq(transaction.bankAccountId, entityId))) ||
      ((ledgerIdEq(transaction.accountId, entityId) || ledgerIdEq(transaction.bankAccountId, entityId)) &&
        !ledgerIdEq(transaction.fromAccountId, entityId) &&
        !ledgerIdEq(transaction.toAccountId, entityId));
    const matchesFromAccount = hasFromAccount && ledgerIdEq(transaction.fromAccountId, entityId);
    if (matchesToAccount) debit = amount;
    if (matchesFromAccount) credit = amount;
  } else if (transaction.type === "journal" && Array.isArray(transaction.entries)) {
    const journalAmt = sumJournalAmountsForAccount(transaction.entries, entityId);
    debit += journalAmt.debit;
    credit += journalAmt.credit;
  }

  if (String(transaction.type || "") === "inter_company") {
    const ic = getInterCompanyLedgerAmounts(transaction, "account", entityId, amount);
    if (ic.touched) {
      debit = ic.debit;
      credit = ic.credit;
    }
  }

  return { debit, credit };
}

function cashFlowInOutFromLedgerAmounts(
  transaction: any,
  debit: number,
  credit: number
): { tin: number; tout: number } {
  if (String(transaction?.type || "") !== "inter_company" || (!debit && !credit)) {
    return { tin: debit, tout: credit };
  }
  if (debit > 0 && credit > 0) {
    const amt = Math.max(debit, credit);
    const dir = interCompanyPaymentDirection(transaction);
    if (dir === "out") return { tin: 0, tout: amt };
    if (dir === "in") return { tin: amt, tout: 0 };
    const side = interCompanyVoucherViewerSide(transaction);
    if (side === "source") return { tin: 0, tout: amt };
    if (side === "target") return { tin: amt, tout: 0 };
    return { tin: Math.max(0, debit - credit), tout: Math.max(0, credit - debit) };
  }
  return { tin: debit, tout: credit };
}

/**
 * Daily Summary Today In/Out — IC clearing (equal Dr+Cr) ko single-sided cash flow.
 * Balance (opening/closing) pehle jaisa ledger net (Dr−Cr) se.
 */
export function getAccountDaybookCashFlowInOut(
  transaction: any,
  accountId: string,
  getLedgerAmounts?: AccountLedgerAmountsFn
): { tin: number; tout: number } {
  const amountsFn = getLedgerAmounts || getAccountLedgerTransactionAmounts;
  const { debit, credit } = amountsFn(transaction, accountId);
  return cashFlowInOutFromLedgerAmounts(transaction, debit, credit);
}

export function computeAccountLedgerDaySummary(
  account: DaybookSummaryAccountInput,
  vouchers: any[] | undefined,
  selectedDay: Date,
  userIdFilter?: string | null,
  getLedgerAmounts?: AccountLedgerAmountsFn
): { opening: number; in: number; out: number; closing: number } {
  const dayStart = startOfDay(selectedDay);
  const dayEnd = endOfDay(selectedDay);
  let opening = toNum(account.openingBalance);
  let dayDebit = 0;
  let dayCredit = 0;
  let dayIn = 0;
  let dayOut = 0;
  const accountObDate = safeToDate(account.openingBalanceDate);
  const accountId = String(account.id || "");
  const amountsFn = getLedgerAmounts || getAccountLedgerTransactionAmounts;

  (vouchers || []).forEach((v: any) => {
    if (!v || v.isDeleted) return;
    if (userIdFilter && String(v.userId || "") !== String(userIdFilter)) return;
    const transactionDate = safeToDate(v.date);
    if (!transactionDate) return;
    if (accountObDate && transactionDate < accountObDate) return;

    const { debit, credit } = amountsFn(v, accountId);
    const dr = toNum(debit);
    const cr = toNum(credit);
    if (dr === 0 && cr === 0) return;

    if (transactionDate < dayStart) {
      opening += dr - cr;
    } else if (transactionDate <= dayEnd) {
      dayDebit += dr;
      dayCredit += cr;
      const flow = cashFlowInOutFromLedgerAmounts(v, dr, cr);
      dayIn += toNum(flow.tin);
      dayOut += toNum(flow.tout);
    }
  });

  return {
    opening,
    in: dayIn,
    out: dayOut,
    closing: opening + dayDebit - dayCredit,
  };
}

function emptyBucket() {
  return { yesterday: 0, in: 0, out: 0, today: 0 };
}

function sumField(
  rows: DaybookAccountSummaryRow[],
  key: "yesterday" | "in" | "out" | "today"
): number {
  return rows.reduce((s, r) => s + toNum(r[key]), 0);
}

/** Full voucher set (ledger) se daybook bank/cash Daily Summary — daybook IC table filter mat lagao. */
export function buildDaybookDailySummary(opts: {
  accounts: DaybookSummaryAccountInput[];
  vouchers: any[] | undefined;
  selectedDay: Date;
  userIdFilter?: string | null;
  /** Client: pass ledger `getTransactionAmounts` wrapper so Daily Summary === bank ledger closing. */
  getLedgerAmounts?: AccountLedgerAmountsFn;
}): DaybookDailySummary {
  const { accounts, vouchers, selectedDay, userIdFilter, getLedgerAmounts } = opts;
  const live = (accounts || []).filter((a) => a && !a.isDeleted && a.id);
  const bankAccountsSorted = live
    .filter((a) => a.accountType === "Bank")
    .slice()
    .sort((a, b) => String(a.accountName || "").localeCompare(String(b.accountName || "")));
  const cashAccountsSorted = live
    .filter((a) => a.accountType === "Cash")
    .slice()
    .sort((a, b) => String(a.accountName || "").localeCompare(String(b.accountName || "")));

  const mapRow = (acc: DaybookSummaryAccountInput, fallbackName: string): DaybookAccountSummaryRow => {
    const ledgerDay = computeAccountLedgerDaySummary(
      acc,
      vouchers,
      selectedDay,
      userIdFilter,
      getLedgerAmounts
    );
    return {
      id: String(acc.id),
      name: String(acc.accountName || fallbackName),
      yesterday: ledgerDay.opening,
      in: ledgerDay.in,
      out: ledgerDay.out,
      today: ledgerDay.closing,
    };
  };

  const bankAccounts = bankAccountsSorted.map((acc) => mapRow(acc, "Bank"));
  const cashAccounts = cashAccountsSorted.map((acc) => mapRow(acc, "Cash"));

  const bank = {
    yesterday: sumField(bankAccounts, "yesterday"),
    in: sumField(bankAccounts, "in"),
    out: sumField(bankAccounts, "out"),
    today: sumField(bankAccounts, "today"),
  };
  const cash = {
    yesterday: sumField(cashAccounts, "yesterday"),
    in: sumField(cashAccounts, "in"),
    out: sumField(cashAccounts, "out"),
    today: sumField(cashAccounts, "today"),
  };
  const total = {
    yesterday: bank.yesterday + cash.yesterday,
    in: bank.in + cash.in,
    out: bank.out + cash.out,
    today: bank.today + cash.today,
  };

  if (!bankAccounts.length && !cashAccounts.length) {
    return { bank: emptyBucket(), cash: emptyBucket(), total: emptyBucket(), bankAccounts: [], cashAccounts: [] };
  }

  return { bank, cash, total, bankAccounts, cashAccounts };
}
