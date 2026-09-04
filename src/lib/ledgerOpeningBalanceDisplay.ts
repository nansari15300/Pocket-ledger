import { startOfDay } from "date-fns";
import { parseOpeningBalanceDateToLocalNoon } from "@/lib/voucherDateNormalize";

export const BOOK_OB_EPS = 5e-4;

type GroupMemberOpeningRow = {
  openingBalance?: unknown;
  openingBalanceRate?: unknown;
  purchasePrice?: unknown;
  salePrice?: unknown;
  stockQty?: unknown;
};

function isItemGroupMemberRow(member: GroupMemberOpeningRow): boolean {
  return (
    "purchasePrice" in member ||
    "salePrice" in member ||
    "stockQty" in member ||
    "openingBalanceRate" in member
  );
}

/** Sum opening balances for members currently in group ledger scope (incl. single member filter). */
export function sumGroupMemberOpeningBalances(
  members: GroupMemberOpeningRow[],
  stockView?: "amount" | "qty"
): number {
  if (!members.length) return 0;
  const isItemGroup = isItemGroupMemberRow(members[0]!);
  return members.reduce((sum, item) => {
    if (isItemGroup && stockView === "amount") {
      return sum + (Number(item.openingBalance) || 0) * (Number(item.openingBalanceRate) || 0);
    }
    return sum + (Number(item.openingBalance) || 0);
  }, 0);
}

/**
 * Books OB for group ledger: sum scoped members when present (0 is valid).
 * Do not fall back to parent group OB when members exist — wrong for member drill-down.
 */
export function resolveGroupBooksOpeningBalance(
  group: { openingBalance?: unknown },
  members: GroupMemberOpeningRow[],
  stockView?: "amount" | "qty"
): number {
  if (members.length > 0) {
    return sumGroupMemberOpeningBalances(members, stockView);
  }
  return Number(group.openingBalance) || 0;
}

export const LEDGER_OPENING_PILL_CONTEXTS = [
  "party",
  "account",
  "staff",
  "tax",
  "item",
  "expense",
  "group",
] as const;

export type LedgerOpeningPrintRow = {
  pillLabel: string;
  signedBalance: number;
  rowDate: Date | null;
};

/** Form "As on" date ledger query range (from/to days, inclusive) ke andar? */
export function isMasterOpeningDateInLedgerQueryRange(
  range: { from?: Date | null; to?: Date | null } | null | undefined,
  masterObDay: Date | null
): boolean {
  if (!masterObDay || !range) return false;
  const ob = startOfDay(masterObDay).getTime();
  const rawFrom = range.from != null ? startOfDay(range.from).getTime() : undefined;
  const rawTo = range.to != null ? startOfDay(range.to).getTime() : undefined;
  if (rawFrom == null && rawTo == null) return false;
  if (rawFrom != null && rawTo != null) {
    const lo = Math.min(rawFrom, rawTo);
    const hi = Math.max(rawFrom, rawTo);
    return ob >= lo && ob <= hi;
  }
  if (rawFrom != null) return ob >= rawFrom;
  return ob <= rawTo!;
}

/**
 * Stack Book Opening + Dated Opening only when period carry differs from books OB
 * (some pre-filter activity was cut). "All" preset still sets a from→to range — without
 * this check both rows show the same books balance and opening looks doubled.
 */
export function shouldStackBookOpeningAboveDatedRow(input: {
  ledgerDateFilterActive?: boolean;
  ledgerShowBookOpeningRow?: boolean;
  booksOpeningBalance?: number | null;
  /** Period / page carry opening (same scale as booksOpeningBalance). */
  periodOpeningBalance: number;
  masterOpeningDateWithinLedgerRange: boolean;
}): boolean {
  const booksOb = input.booksOpeningBalance;
  if (!input.ledgerDateFilterActive || !input.ledgerShowBookOpeningRow) return false;
  if (booksOb == null || !Number.isFinite(booksOb) || Math.abs(booksOb) < BOOK_OB_EPS) return false;
  if (!input.masterOpeningDateWithinLedgerRange) return false;
  const period = Number(input.periodOpeningBalance) || 0;
  if (Math.abs(period) < BOOK_OB_EPS) return false;
  return Math.abs(period - booksOb) >= BOOK_OB_EPS;
}

export type LedgerOpeningPrintInput = {
  context: string;
  /** Page / period carry opening (Dated Opening row). */
  openingBalance: number;
  booksOpeningBalance?: number;
  ledgerShowBookOpeningRow?: boolean;
  ledgerDateFilterActive?: boolean;
  openingBalancePeriodStartDate?: unknown;
  masterOpeningBalanceDate?: unknown;
  dateRange?: { from?: Date | null; to?: Date | null };
};

/** Match TransactionsTable Book Opening / Dated Opening rows for print. */
export function resolveLedgerOpeningPrintRows(
  input: LedgerOpeningPrintInput
): LedgerOpeningPrintRow[] {
  const {
    context,
    openingBalance,
    booksOpeningBalance,
    ledgerShowBookOpeningRow = true,
    ledgerDateFilterActive = false,
    openingBalancePeriodStartDate,
    masterOpeningBalanceDate,
    dateRange,
  } = input;

  const pillsEnabled =
    typeof ledgerDateFilterActive === "boolean" &&
    (LEDGER_OPENING_PILL_CONTEXTS as readonly string[]).includes(context);

  const masterObDay = parseOpeningBalanceDateToLocalNoon(masterOpeningBalanceDate);
  const periodRowDate = parseOpeningBalanceDateToLocalNoon(openingBalancePeriodStartDate);
  const booksOb = booksOpeningBalance ?? 0;

  if (!pillsEnabled) {
    return [
      {
        pillLabel: "Opening Balance",
        signedBalance: openingBalance,
        rowDate: masterObDay,
      },
    ];
  }

  const masterOpeningDateWithinLedgerRange = isMasterOpeningDateInLedgerQueryRange(
    dateRange,
    masterObDay
  );

  const showBookOpeningAboveDatedRow = shouldStackBookOpeningAboveDatedRow({
    ledgerDateFilterActive,
    ledgerShowBookOpeningRow,
    booksOpeningBalance,
    periodOpeningBalance: openingBalance,
    masterOpeningDateWithinLedgerRange,
  });

  const datedRowDate = ledgerDateFilterActive
    ? periodRowDate
    : !ledgerShowBookOpeningRow && periodRowDate
      ? periodRowDate
      : masterObDay;

  const primaryPillLabel = showBookOpeningAboveDatedRow
    ? "Dated Opening"
    : ledgerShowBookOpeningRow &&
        (!ledgerDateFilterActive ||
          (masterOpeningDateWithinLedgerRange &&
            (booksOpeningBalance == null ||
              Math.abs(openingBalance - booksOb) < BOOK_OB_EPS ||
              Math.abs(openingBalance) < BOOK_OB_EPS)))
      ? "Book Opening"
      : "Dated Opening";

  if (showBookOpeningAboveDatedRow) {
    return [
      { pillLabel: "Book Opening", signedBalance: booksOb, rowDate: masterObDay },
      { pillLabel: "Dated Opening", signedBalance: openingBalance, rowDate: datedRowDate },
    ];
  }

  return [
    {
      pillLabel: primaryPillLabel,
      signedBalance: openingBalance,
      rowDate: datedRowDate,
    },
  ];
}

export const SPEND_WISE_OPENING_GROUP_ID = "sw-group-opening-balance";

export type SpendWiseOpeningPrintEmbedMeta = {
  embed: boolean;
  groupId: string | null;
  colorIndex: number;
};

/** Match TransactionsTable: Book/Dated opening ko spend-wise group ke andar print karo. */
export function resolveSpendWiseOpeningPrintEmbedMeta(
  transactions: readonly unknown[],
  ledgerShowBookOpeningRow?: boolean
): SpendWiseOpeningPrintEmbedMeta {
  const rows = (transactions ?? []).filter((t) => !(t as { _spendWiseSpacer?: boolean })?._spendWiseSpacer);
  const obRow = rows.find(
    (t) => (t as { _spendWiseGroupId?: string })?._spendWiseGroupId === SPEND_WISE_OPENING_GROUP_ID
  );
  if (obRow) {
    return {
      embed: true,
      groupId: SPEND_WISE_OPENING_GROUP_ID,
      colorIndex: Number((obRow as { _spendWiseGroupColorIndex?: number })._spendWiseGroupColorIndex) || 0,
    };
  }
  if (ledgerShowBookOpeningRow) {
    const firstGroupRow = rows.find(
      (t) =>
        (t as { _spendWiseGroupFirst?: boolean })._spendWiseGroupFirst === true ||
        Boolean((t as { _spendWiseGroupId?: string })._spendWiseGroupId)
    );
    if (firstGroupRow) {
      return {
        embed: true,
        groupId: String((firstGroupRow as { _spendWiseGroupId?: string })._spendWiseGroupId || "") || null,
        colorIndex: Number((firstGroupRow as { _spendWiseGroupColorIndex?: number })._spendWiseGroupColorIndex) || 0,
      };
    }
  }
  return { embed: false, groupId: null, colorIndex: 0 };
}

export type SpendWiseOpeningPrintInjectInput = {
  spendWise?: boolean;
  context: string;
  openingBalance: number;
  booksOpeningBalance?: number;
  ledgerShowBookOpeningRow?: boolean;
  ledgerDateFilterActive?: boolean;
  openingBalancePeriodStartDate?: unknown;
  openingBalanceDate?: unknown;
  ledgerDateRange?: { from?: Date | null; to?: Date | null };
  openingBalanceNarration?: string | null;
  showNarration?: boolean;
  transactions: readonly unknown[];
};

/** Spend-wise print: opening rows ko pehle group ke andar inject — screen jaisa grouped card. */
export function injectSpendWiseEmbeddedOpeningPrintRows(
  rows: any[],
  input: SpendWiseOpeningPrintInjectInput
): { rows: any[]; skipStandaloneOpeningRow: boolean } {
  if (!input.spendWise) return { rows, skipStandaloneOpeningRow: false };

  const meta = resolveSpendWiseOpeningPrintEmbedMeta(input.transactions, input.ledgerShowBookOpeningRow);
  if (!meta.embed) return { rows, skipStandaloneOpeningRow: false };

  const openingSpecs = resolveLedgerOpeningPrintRows({
    context: input.context,
    openingBalance: Number(input.openingBalance) || 0,
    booksOpeningBalance: input.booksOpeningBalance,
    ledgerShowBookOpeningRow: input.ledgerShowBookOpeningRow,
    ledgerDateFilterActive: input.ledgerDateFilterActive,
    openingBalancePeriodStartDate: input.openingBalancePeriodStartDate,
    masterOpeningBalanceDate: input.openingBalanceDate,
    dateRange: input.ledgerDateRange,
  });

  const insertIdx = rows.findIndex((r) =>
    meta.groupId ? r._spendWiseGroupId === meta.groupId : r._spendWiseGroupFirst === true || r._spendWiseGroupId
  );
  if (insertIdx < 0) return { rows, skipStandaloneOpeningRow: false };

  const narrationTrimmed = (input.openingBalanceNarration ?? "").trim();
  const synthetic = openingSpecs.map((spec, i) => ({
    id: `__print_embedded_ob_${i}__`,
    type: "opening_balance",
    _spendWiseEmbeddedOpening: true,
    _spendWiseGroupId: meta.groupId,
    _spendWiseGroupColorIndex: meta.colorIndex,
    _spendWiseGroupFirst: i === 0,
    _spendWiseGroupLast: false,
    _spendWiseChild: false,
    _spendWiseOpeningPillLabel: spec.pillLabel,
    debit: spec.signedBalance > 0 ? Math.abs(spec.signedBalance) : 0,
    credit: spec.signedBalance < 0 ? Math.abs(spec.signedBalance) : 0,
    runningBalance: spec.signedBalance,
    date: spec.rowDate,
    narration:
      input.showNarration && narrationTrimmed && i === openingSpecs.length - 1 ? narrationTrimmed : "",
  }));

  const out = [...rows];
  const firstTxIdx = insertIdx + synthetic.length;
  if (out[firstTxIdx]?._spendWiseGroupFirst === true) {
    out[firstTxIdx] = { ...out[firstTxIdx], _spendWiseGroupFirst: false };
  }
  out.splice(insertIdx, 0, ...synthetic);
  return { rows: out, skipStandaloneOpeningRow: true };
}
