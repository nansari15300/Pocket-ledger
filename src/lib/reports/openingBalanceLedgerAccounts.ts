export const OPENING_BALANCE_SYSTEM_LEDGER_ID = "opening_balance_ledger";

export type OpeningBalanceLedgerEntityType =
  | "party"
  | "account"
  | "staff"
  | "tax"
  | "expense";

export type OpeningBalanceLedgerAccountRow = {
  id: string;
  accountName: string;
  entityType: OpeningBalanceLedgerEntityType;
  openingBalance: number;
  openingBalanceDate: Date | null;
  debit: number;
  credit: number;
  runningBalance: number;
  /** Equity system ledger — deterministic mirror of current master opening balances. */
  isSystemOpeningBalanceLedger?: boolean;
};

export type OpeningBalanceLedgerTotals = {
  totalDebit: number;
  totalCredit: number;
  netSigned: number;
};

export type OpeningBalanceLedgerBreakdown = {
  /** User masters only (party/bank/staff/tax/income-expense) — matches Balance Sheet mismatch card. */
  masterRows: OpeningBalanceLedgerAccountRow[];
  systemLedgerRow: OpeningBalanceLedgerAccountRow | null;
  masterTotals: OpeningBalanceLedgerTotals;
  combinedTotals: OpeningBalanceLedgerTotals;
};

export function openingBalanceLedgerAccountRowKey(
  row: OpeningBalanceLedgerAccountRow
): string {
  return `${row.entityType}-${row.id}`;
}

/** Master list page with ?selected= — double-click edit navigation. */
export function openingBalanceLedgerAccountEditHref(
  row: OpeningBalanceLedgerAccountRow
): string | null {
  if (row.isSystemOpeningBalanceLedger) return null;
  const id = encodeURIComponent(row.id);
  switch (row.entityType) {
    case "party":
      return `/party?selected=${id}`;
    case "account":
      return `/bank-cash?selected=${id}`;
    case "staff":
      return `/staff?selected=${id}`;
    case "tax":
      return `/tax?selected=${id}`;
    case "expense":
      return `/incomes?selected=${id}`;
    default:
      return null;
  }
}

export type OpeningBalanceLedgerAccountsInput = {
  processedParties: Array<Record<string, unknown>>;
  processedStaff: Array<Record<string, unknown>>;
  processedAccounts: Array<Record<string, unknown>>;
  processedTaxes: Array<Record<string, unknown>>;
  processedExpenseAccounts: Array<Record<string, unknown>>;
  dateRange?: { from?: Date; to?: Date };
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function readOpeningBalanceDate(raw: unknown): Date | null {
  if (!raw) return null;
  if (raw instanceof Date) return raw;
  const maybe = raw as { toDate?: () => Date };
  if (typeof maybe.toDate === "function") return maybe.toDate();
  const parsed = new Date(raw as string);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function pushAccount(
  list: OpeningBalanceLedgerAccountRow[],
  row: Omit<OpeningBalanceLedgerAccountRow, "debit" | "credit" | "runningBalance">
) {
  const ob = round2(row.openingBalance);
  if (Math.abs(ob) < 0.005) return;
  list.push({
    ...row,
    openingBalance: ob,
    debit: ob > 0 ? ob : 0,
    credit: ob < 0 ? Math.abs(ob) : 0,
    runningBalance: 0,
  });
}

function sumOpeningBalanceTotals(rows: OpeningBalanceLedgerAccountRow[]): OpeningBalanceLedgerTotals {
  let totalDebit = 0;
  let totalCredit = 0;
  for (const row of rows) {
    totalDebit += row.debit;
    totalCredit += row.credit;
  }
  return {
    totalDebit: round2(totalDebit),
    totalCredit: round2(totalCredit),
    netSigned: round2(totalDebit - totalCredit),
  };
}

function buildMasterOpeningBalanceRows(
  input: OpeningBalanceLedgerAccountsInput
): OpeningBalanceLedgerAccountRow[] {
  const accounts: OpeningBalanceLedgerAccountRow[] = [];

  for (const p of input.processedParties) {
    if (String(p.id) === OPENING_BALANCE_SYSTEM_LEDGER_ID) continue;
    pushAccount(accounts, {
      id: String(p.id),
      accountName: String(p.name || "Party"),
      entityType: "party",
      openingBalance: Number(p.openingBalance) || 0,
      openingBalanceDate: readOpeningBalanceDate(p.openingBalanceDate),
    });
  }

  for (const s of input.processedStaff) {
    pushAccount(accounts, {
      id: String(s.id),
      accountName: String(s.name || "Staff"),
      entityType: "staff",
      openingBalance: Number(s.openingBalance) || 0,
      openingBalanceDate: readOpeningBalanceDate(s.openingBalanceDate),
    });
  }

  for (const a of input.processedAccounts) {
    pushAccount(accounts, {
      id: String(a.id),
      accountName: String(a.accountName || a.name || "Account"),
      entityType: "account",
      openingBalance: Number(a.openingBalance) || 0,
      openingBalanceDate: readOpeningBalanceDate(a.openingBalanceDate),
    });
  }

  for (const t of input.processedTaxes) {
    pushAccount(accounts, {
      id: String(t.id),
      accountName: String(t.name || "Tax"),
      entityType: "tax",
      openingBalance: Number(t.openingBalance) || 0,
      openingBalanceDate: readOpeningBalanceDate(t.openingBalanceDate),
    });
  }

  for (const e of input.processedExpenseAccounts) {
    pushAccount(accounts, {
      id: String(e.id),
      accountName: String(e.name || "Income/Expense"),
      entityType: "expense",
      openingBalance: Number(e.openingBalance) || 0,
      openingBalanceDate: readOpeningBalanceDate((e as Record<string, unknown>).openingBalanceDate),
    });
  }

  const sorted = accounts.sort((a, b) => a.accountName.localeCompare(b.accountName));

  let running = 0;
  return sorted.map((acc) => {
    running = round2(running + acc.debit - acc.credit);
    return {
      ...acc,
      runningBalance: running,
    };
  });
}

/** @deprecated Use computeOpeningBalanceLedgerBreakdown */
export function computeOpeningBalanceLedgerAccounts(
  input: OpeningBalanceLedgerAccountsInput
): OpeningBalanceLedgerAccountRow[] {
  return computeOpeningBalanceLedgerBreakdown(input).masterRows;
}

export function computeOpeningBalanceLedgerBreakdown(
  input: OpeningBalanceLedgerAccountsInput
): OpeningBalanceLedgerBreakdown {
  const masterRows = buildMasterOpeningBalanceRows(input);

  const systemParty = input.processedParties.find(
    (p) => String(p.id) === OPENING_BALANCE_SYSTEM_LEDGER_ID
  );
  let systemLedgerRow: OpeningBalanceLedgerAccountRow | null = null;
  if (systemParty) {
    const ob = round2(Number(systemParty.openingBalance) || 0);
    if (Math.abs(ob) >= 0.005) {
      systemLedgerRow = {
        id: OPENING_BALANCE_SYSTEM_LEDGER_ID,
        accountName: String(systemParty.name || "Opening Balance"),
        entityType: "party",
        openingBalance: ob,
        openingBalanceDate: readOpeningBalanceDate(systemParty.openingBalanceDate),
        debit: ob > 0 ? ob : 0,
        credit: ob < 0 ? Math.abs(ob) : 0,
        runningBalance: 0,
        isSystemOpeningBalanceLedger: true,
      };
    }
  }

  const masterTotals = sumOpeningBalanceTotals(masterRows);
  const combinedTotals = sumOpeningBalanceTotals(
    systemLedgerRow ? [...masterRows, systemLedgerRow] : masterRows
  );

  return {
    masterRows,
    systemLedgerRow,
    masterTotals,
    combinedTotals,
  };
}
