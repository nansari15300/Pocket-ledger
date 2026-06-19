import { endOfDay, startOfDay } from "date-fns";
import { resolveRpEntityName } from "@/lib/receivablesPayablesEntityKeys";

/** Dashboard date filter — `ad-calendar` DateRange jaisa; server/lib boundary par local type taaki "use client" import na ho. */
export type ReceivablesPayablesDateRange = { from?: Date; to?: Date };

/** Firestore Timestamp / string / Date — R/P date filter ke liye. */
export function safeToDateRp(date: unknown): Date | null {
  if (date == null) return null;
  if (date instanceof Date) return date;
  const d = date as { toDate?: () => Date };
  if (typeof d.toDate === "function") return d.toDate();
  const parsed = new Date(date as string);
  return isNaN(parsed.getTime()) ? null : parsed;
}

export type RpEntityRow = { party: string; balance: number; fileUrl?: string; entityId: string };

export type RpSideBuckets = {
  parties: RpEntityRow[];
  accounts: RpEntityRow[];
  staff: RpEntityRow[];
  taxes: RpEntityRow[];
  income: RpEntityRow[];
  expenses: RpEntityRow[];
};

export type ReceivablesPayablesFinancialSummary = {
  totalReceivable: number;
  totalPayable: number;
  receivables: RpSideBuckets;
  payables: RpSideBuckets;
  recCount: number;
  payCount: number;
};

const EMPTY_BUCKETS: RpSideBuckets = {
  parties: [],
  accounts: [],
  staff: [],
  taxes: [],
  income: [],
  expenses: [],
};

const EMPTY: ReceivablesPayablesFinancialSummary = {
  totalReceivable: 0,
  totalPayable: 0,
  receivables: { ...EMPTY_BUCKETS },
  payables: { ...EMPTY_BUCKETS },
  recCount: 0,
  payCount: 0,
};

function pushBalanceRow(
  receivables: RpSideBuckets,
  payables: RpSideBuckets,
  balance: number,
  name: string,
  fileUrl: string | undefined,
  bucket: keyof RpSideBuckets,
  entityId: string
) {
  const entityData = { party: name, balance, fileUrl, entityId };
  if (balance > 0.01) receivables[bucket].push(entityData);
  else if (balance < -0.01) payables[bucket].push(entityData);
}

/**
 * Dashboard + FinancialSummaryCards dono ka shared R/P block — vouchers × entities par
 * processEntity (openingBalance + filtered vouchers).
 */
export function computeReceivablesPayablesFinancialSummary(args: {
  vouchers: any[];
  processedParties: any[];
  processedStaff: any[];
  processedTaxes: any[];
  processedAccounts?: any[];
  processedExpenseAccounts?: any[];
  receivablesDateRange: ReceivablesPayablesDateRange | undefined;
  /** true = abhi data load ho raha; zero skeleton (pehle jaisa). */
  loading?: boolean;
}): ReceivablesPayablesFinancialSummary {
  const {
    vouchers,
    processedParties,
    processedStaff,
    processedTaxes,
    processedAccounts = [],
    processedExpenseAccounts = [],
    receivablesDateRange,
    loading = false,
  } = args;
  if (loading) return { ...EMPTY };

  let filteredVouchers = vouchers;
  if (receivablesDateRange?.from) {
    const fromDate = startOfDay(receivablesDateRange.from);
    const toDate = receivablesDateRange.to
      ? endOfDay(receivablesDateRange.to)
      : endOfDay(fromDate);
    filteredVouchers = vouchers.filter((v) => {
      const txDate = safeToDateRp(v.date);
      return txDate && txDate >= fromDate && txDate <= toDate;
    });
  }

  const receivables: RpSideBuckets = {
    parties: [],
    accounts: [],
    staff: [],
    taxes: [],
    income: [],
    expenses: [],
  };
  const payables: RpSideBuckets = {
    parties: [],
    accounts: [],
    staff: [],
    taxes: [],
    income: [],
    expenses: [],
  };

  const processPartyStaffTax = (entity: any, type: "party" | "staff" | "tax") => {
    let balance = Number(entity.openingBalance) || 0;

    filteredVouchers.forEach((v) => {
      const amount = v.total || v.amount || 0;

      if (v.type === "journal") {
        const entry = v.entries?.find((e: any) => e.accountId === entity.id);
        if (entry) {
          balance += (Number(entry.debit) || 0) - (Number(entry.credit) || 0);
        }
      } else {
        if (v.partyId === entity.id && type === "party") {
          if (["sale", "payment_out", "direct_income"].includes(v.type)) balance += amount;
          else if (["purchase", "payment_in", "direct_expense"].includes(v.type)) balance -= amount;
        } else if (v.staffId === entity.id && type === "staff") {
          if (v.type === "payment_out") balance += amount;
          else if (v.type === "payment_in") balance -= amount;
        } else if (v.taxAccountId === entity.id && type === "tax") {
          if (v.type === "payment_out") balance += amount;
          else if (v.type === "payment_in") balance -= amount;
        } else if (v.lineItems?.some((li: any) => li.taxAccountId === entity.id) && type === "tax") {
          const taxAmount = v.lineItems.reduce(
            (sum: number, li: any) => (li.taxAccountId === entity.id ? sum + Number(li.taxAmount || 0) : sum),
            0
          );
          if (v.type === "purchase") balance += taxAmount;
          else if (v.type === "sale") balance -= taxAmount;
        }
      }
    });

    const bucket =
      type === "party" ? "parties" : type === "staff" ? "staff" : "taxes";
    pushBalanceRow(receivables, payables, balance, entity.name, entity.fileUrl, bucket, String(entity.id || ""));
  };

  const incomeExpenseBucket = (entity: { type?: string }): "income" | "expenses" =>
    String(entity.type || "Expense") === "Income" ? "income" : "expenses";

  const processBankAccount = (account: any) => {
    let balance = Number(account.openingBalance) || 0;
    filteredVouchers.forEach((v) => {
      const amount = Number(v.total || v.amount || 0);
      if (v.type === "journal") {
        const entry = v.entries?.find((e: any) => e.accountId === account.id);
        if (entry) balance += (Number(entry.debit) || 0) - (Number(entry.credit) || 0);
      } else {
        if (["payment_in", "direct_income", "sale"].includes(v.type) && v.accountId === account.id) balance += amount;
        if (["payment_out", "direct_expense", "purchase", "add_salary"].includes(v.type) && v.accountId === account.id) {
          balance -= amount;
        }
        if (v.type === "contra") {
          if (v.toAccountId === account.id) balance += amount;
          if (v.fromAccountId === account.id) balance -= amount;
        }
      }
    });
    pushBalanceRow(
      receivables,
      payables,
      balance,
      resolveRpEntityName(account, "bank"),
      account.fileUrl,
      "accounts",
      String(account.id || "")
    );
  };

  const processIncomeExpenseAccount = (entity: any) => {
    let balance = Number(entity.openingBalance) || 0;
    filteredVouchers.forEach((v) => {
      const amount = Number(v.total || v.amount || 0);
      if (v.type === "journal") {
        const entry = v.entries?.find((e: any) => e.accountId === entity.id);
        if (entry) balance += (Number(entry.debit) || 0) - (Number(entry.credit) || 0);
      } else {
        if (v.incomeAccountId === entity.id && ["payment_in", "direct_income"].includes(v.type)) balance -= amount;
        const expId = v.expenseAccountId || v.toAccountId;
        if (expId === entity.id && ["payment_out", "direct_expense", "add_salary"].includes(v.type)) balance += amount;
        if (v.type === "purchase" && v.purchaseAccountId === entity.id) balance += amount;
        if (v.type === "sale" && v.salesAccountId === entity.id) balance -= amount;
      }
    });
    pushBalanceRow(
      receivables,
      payables,
      balance,
      resolveRpEntityName(entity, incomeExpenseBucket(entity) === "income" ? "income" : "expense"),
      entity.fileUrl,
      incomeExpenseBucket(entity),
      String(entity.id || "")
    );
  };

  processedParties.forEach((p) => processPartyStaffTax(p, "party"));
  processedStaff.forEach((s) => processPartyStaffTax(s, "staff"));
  processedTaxes.forEach((t) => processPartyStaffTax(t, "tax"));
  processedAccounts.forEach((a) => processBankAccount(a));
  processedExpenseAccounts.forEach((e) => processIncomeExpenseAccount(e));

  const sortFn = (a: RpEntityRow, b: RpEntityRow) => Math.abs(b.balance) - Math.abs(a.balance);
  (Object.keys(receivables) as (keyof RpSideBuckets)[]).forEach((k) => receivables[k].sort(sortFn));
  (Object.keys(payables) as (keyof RpSideBuckets)[]).forEach((k) => payables[k].sort(sortFn));

  const calcSum = (arr: RpEntityRow[]) => arr.reduce((sum, item) => sum + item.balance, 0);
  const calcPaySum = (arr: RpEntityRow[]) => arr.reduce((sum, item) => sum + Math.abs(item.balance), 0);

  const bucketSum = (side: RpSideBuckets, calc: (arr: RpEntityRow[]) => number) =>
    calc(side.parties) +
    calc(side.accounts) +
    calc(side.staff) +
    calc(side.taxes) +
    calc(side.income) +
    calc(side.expenses);

  const totalReceivable = bucketSum(receivables, calcSum);
  const totalPayable = bucketSum(payables, calcPaySum);

  const bucketCount = (side: RpSideBuckets) =>
    side.parties.length +
    side.accounts.length +
    side.staff.length +
    side.taxes.length +
    side.income.length +
    side.expenses.length;

  const recCount = bucketCount(receivables);
  const payCount = bucketCount(payables);

  return { totalReceivable, totalPayable, receivables, payables, recCount, payCount };
}
