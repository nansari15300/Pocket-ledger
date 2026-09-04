import { endOfDay, startOfDay } from "date-fns";
import { resolveRpEntityName } from "@/lib/receivablesPayablesEntityKeys";
import { computeRpLedgerAlignedBalance } from "@/lib/receivablesPayablesLedgerAmounts";

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

export type RpEntityRow = {
  party: string;
  balance: number;
  fileUrl?: string;
  entityId: string;
  interCompanyPeerCompanyId?: string;
  interCompanyPeerCompanyName?: string;
  interCompanyPeerEntityLabel?: string;
  interCompanyClearingMode?: string;
};

type RpEntityRowMeta = Pick<
  RpEntityRow,
  | "interCompanyPeerCompanyId"
  | "interCompanyPeerCompanyName"
  | "interCompanyPeerEntityLabel"
  | "interCompanyClearingMode"
>;

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
  entityId: string,
  meta?: RpEntityRowMeta
) {
  const entityData: RpEntityRow = { party: name, balance, fileUrl, entityId, ...meta };
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

  let balanceVouchers = vouchers;
  if (receivablesDateRange?.from) {
    const toDate = receivablesDateRange.to
      ? endOfDay(receivablesDateRange.to)
      : endOfDay(startOfDay(receivablesDateRange.from));
    // Period balance is "as of range end": master opening + all earlier vouchers + range vouchers.
    balanceVouchers = vouchers.filter((v) => {
      const txDate = safeToDateRp(v.date);
      return txDate && txDate <= toDate;
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
    const balance = computeRpLedgerAlignedBalance(
      Number(entity.openingBalance) || 0,
      balanceVouchers,
      String(entity.id || ""),
      type,
      processedTaxes
    );
    const bucket =
      type === "party" ? "parties" : type === "staff" ? "staff" : "taxes";
    pushBalanceRow(receivables, payables, balance, entity.name, entity.fileUrl, bucket, String(entity.id || ""), {
      interCompanyPeerCompanyId: entity.interCompanyPeerCompanyId,
      interCompanyPeerCompanyName: entity.interCompanyPeerCompanyName,
      interCompanyPeerEntityLabel: entity.interCompanyPeerEntityLabel,
      interCompanyClearingMode: entity.interCompanyClearingMode,
    });
  };

  const incomeExpenseBucket = (entity: { type?: string }): "income" | "expenses" =>
    String(entity.type || "Expense") === "Income" ? "income" : "expenses";

  const processBankAccount = (account: any) => {
    const balance = computeRpLedgerAlignedBalance(
      Number(account.openingBalance) || 0,
      balanceVouchers,
      String(account.id || ""),
      "account"
    );
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
    const balance = computeRpLedgerAlignedBalance(
      Number(entity.openingBalance) || 0,
      balanceVouchers,
      String(entity.id || ""),
      "expense"
    );
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
