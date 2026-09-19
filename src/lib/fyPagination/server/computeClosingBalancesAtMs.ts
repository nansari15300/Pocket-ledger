/**
 * Server-safe ledger closing at `beforeMs` — party + bank/cash (no "use client" hooks).
 * Processes vouchers in pages; never requires full voucher list in memory.
 */
import { startOfDay } from "date-fns";
import { getAccountLedgerTransactionAmounts } from "@/lib/accountLedgerDaySummary";
import {
  buildPartyLedgerAggregateMap,
  getPartyLedgerTransactionAmounts,
  voucherMatchesPartyLedgerForBalance,
  type PartyLedgerDebitCredit,
} from "@/lib/partyListLedgerBalance";
import {
  effectiveOpeningBalanceDateBeforeMs,
  isLedgerTransactionOnOrAfterOpeningDate,
} from "@/lib/fyPagination/ledgerOpeningDateFilter";
import {
  getGenericMasterClosingAmounts,
  type GenericMasterClosingRow,
} from "@/lib/fyPagination/server/ledgerGenericMasterClosing";
import { parseServerVoucherDateField } from "@/lib/server/voucherDateFieldParse";

export type ServerLedgerMasterRow = {
  id: string;
  kind: "party" | "account" | "staff" | "tax" | "expense" | "item";
  openingBalance?: unknown;
  openingBalanceDate?: unknown;
  purchasePrice?: unknown;
  unitConversions?: unknown;
};

type AccountRunning = {
  id: string;
  openingBalance: number;
  openingBalanceDate: Date | null;
  effectiveOpeningBalanceDate: Date | null;
  balance: number;
};

export type ServerClosingAccumulator = {
  beforeMs: number;
  respectMasterOpeningBalanceDate: boolean;
  partyMasters: Array<{
    id: string;
    openingBalance: number;
    openingBalanceDate: Date | null;
    effectiveOpeningBalanceDate: Date | null;
  }>;
  accountMasters: AccountRunning[];
  genericMasters: Array<GenericMasterClosingRow & { balance: number; effectiveOpeningBalanceDate: Date | null }>;
  processedTaxes: Array<{ id: string; rate?: number }>;
  partyIdSet: Set<string>;
  partyAgg: Map<string, PartyLedgerDebitCredit>;
  voucherCountTotal: number;
  preFyVoucherCount: number;
};

export function firestoreValueToJsDate(value: unknown): Date | null {
  return parseServerVoucherDateField(value);
}

export function createServerClosingAccumulator(
  masters: ServerLedgerMasterRow[],
  beforeMs: number,
  respectMasterOpeningBalanceDate = true
): ServerClosingAccumulator {
  const partyMasters: ServerClosingAccumulator["partyMasters"] = [];
  const accountMasters: AccountRunning[] = [];
  const genericMasters: ServerClosingAccumulator["genericMasters"] = [];
  const processedTaxes: Array<{ id: string; rate?: number }> = [];
  const partyIdSet = new Set<string>();

  for (const master of masters) {
    const openingBalanceDate = parseServerVoucherDateField(master.openingBalanceDate);
    const effectiveOpeningBalanceDate = effectiveOpeningBalanceDateBeforeMs(
      openingBalanceDate,
      beforeMs,
      respectMasterOpeningBalanceDate
    );

    if (master.kind === "party") {
      partyIdSet.add(master.id);
      partyMasters.push({
        id: master.id,
        openingBalance: Number(master.openingBalance) || 0,
        openingBalanceDate,
        effectiveOpeningBalanceDate,
      });
    } else if (master.kind === "account") {
      accountMasters.push({
        id: master.id,
        openingBalance: Number(master.openingBalance) || 0,
        openingBalanceDate,
        effectiveOpeningBalanceDate,
        balance: Number(master.openingBalance) || 0,
      });
    } else if (master.kind === "tax") {
      processedTaxes.push({ id: master.id, rate: Number((master as any).rate) || 0 });
      genericMasters.push({
        id: master.id,
        context: "tax",
        balance: Number(master.openingBalance) || 0,
        effectiveOpeningBalanceDate,
      });
    } else if (master.kind === "staff") {
      genericMasters.push({
        id: master.id,
        context: "staff",
        balance: Number(master.openingBalance) || 0,
        effectiveOpeningBalanceDate,
      });
    } else if (master.kind === "expense") {
      genericMasters.push({
        id: master.id,
        context: "expense",
        balance: Number(master.openingBalance) || 0,
        effectiveOpeningBalanceDate,
      });
    } else if (master.kind === "item") {
      genericMasters.push({
        id: master.id,
        context: "item",
        purchasePrice: Number(master.purchasePrice) || 0,
        unitConversions: Array.isArray(master.unitConversions) ? master.unitConversions : undefined,
        balance: Number(master.openingBalance) || 0,
        effectiveOpeningBalanceDate,
      });
    }
  }

  return {
    beforeMs,
    respectMasterOpeningBalanceDate,
    partyMasters,
    accountMasters,
    genericMasters,
    processedTaxes,
    partyIdSet,
    partyAgg: new Map(),
    voucherCountTotal: 0,
    preFyVoucherCount: 0,
  };
}

function voucherIsStrictlyBeforeMs(transactionDate: Date, beforeMs: number): boolean {
  return startOfDay(transactionDate).getTime() < beforeMs;
}

/** Add one paginated voucher batch — only vouchers with `date < beforeMs`. */
export function accumulateVouchersForServerClosing(
  acc: ServerClosingAccumulator,
  vouchers: any[]
): void {
  if (!vouchers.length) return;

  for (const t of vouchers) {
    if (t?.isDeleted === true) continue;
    acc.voucherCountTotal++;

    const transactionDate = parseServerVoucherDateField(t?.date);
    if (!transactionDate || !voucherIsStrictlyBeforeMs(transactionDate, acc.beforeMs)) continue;

    acc.preFyVoucherCount++;

    for (const master of acc.partyMasters) {
      if (
        !isLedgerTransactionOnOrAfterOpeningDate(transactionDate, master.effectiveOpeningBalanceDate)
      ) {
        continue;
      }
      if (!voucherMatchesPartyLedgerForBalance(t, master.id)) continue;
      const amounts = getPartyLedgerTransactionAmounts(t, master.id);
      if (amounts.debit === 0 && amounts.credit === 0 && t?.type !== "note") continue;
      const row = acc.partyAgg.get(master.id) || { debit: 0, credit: 0 };
      row.debit += amounts.debit;
      row.credit += amounts.credit;
      acc.partyAgg.set(master.id, row);
    }

    for (const master of acc.accountMasters) {
      if (
        !isLedgerTransactionOnOrAfterOpeningDate(transactionDate, master.effectiveOpeningBalanceDate)
      ) {
        continue;
      }
      const amounts = getAccountLedgerTransactionAmounts(t, master.id);
      master.balance += amounts.debit - amounts.credit;
    }

    for (const master of acc.genericMasters) {
      if (
        !isLedgerTransactionOnOrAfterOpeningDate(transactionDate, master.effectiveOpeningBalanceDate)
      ) {
        continue;
      }
      const amounts = getGenericMasterClosingAmounts(t, master, acc.processedTaxes);
      master.balance += amounts.debit - amounts.credit;
    }
  }
}

export function finalizeServerClosingBalances(acc: ServerClosingAccumulator): Record<string, number> {
  const balances: Record<string, number> = {};

  for (const master of acc.partyMasters) {
    const row = acc.partyAgg.get(master.id) || { debit: 0, credit: 0 };
    balances[master.id] = master.openingBalance + row.debit - row.credit;
  }

  for (const master of acc.accountMasters) {
    balances[master.id] = master.balance;
  }

  for (const master of acc.genericMasters) {
    balances[master.id] = master.balance;
  }

  return balances;
}

/** Party + bank/cash closing balances immediately before `beforeMs`. */
export function computeServerLedgerClosingBalancesAtMs(
  masters: ServerLedgerMasterRow[],
  vouchers: any[],
  beforeMs: number
): Record<string, number> {
  if (!Number.isFinite(beforeMs) || beforeMs <= 0) return {};

  const acc = createServerClosingAccumulator(masters, beforeMs);
  const sorted = [...vouchers].filter((v) => {
    if (v?.isDeleted === true) return false;
    const d = parseServerVoucherDateField(v?.date);
    return d && voucherIsStrictlyBeforeMs(d, beforeMs);
  });

  sorted.sort((a, b) => {
    const am = parseServerVoucherDateField(a?.date)?.getTime() ?? 0;
    const bm = parseServerVoucherDateField(b?.date)?.getTime() ?? 0;
    return am - bm;
  });

  // Legacy path: party masters still respect openingBalanceDate per voucher in aggregate map build.
  const balances: Record<string, number> = {};
  const partyMasters = masters.filter((m) => m.kind === "party");

  for (const master of partyMasters) {
    const openingBalanceDate = parseServerVoucherDateField(master.openingBalanceDate);
    const partyVouchers = sorted.filter((t) => {
      const transactionDate = parseServerVoucherDateField(t?.date);
      if (!transactionDate) return false;
      if (openingBalanceDate && transactionDate < openingBalanceDate) return false;
      return true;
    });
    const agg = buildPartyLedgerAggregateMap(partyVouchers, new Set([master.id]));
    const row = agg.get(master.id) || { debit: 0, credit: 0 };
    const booksOb = Number(master.openingBalance) || 0;
    balances[master.id] = booksOb + row.debit - row.credit;
  }

  for (const master of masters.filter((m) => m.kind === "account")) {
    let balance = Number(master.openingBalance) || 0;
    const openingBalanceDate = parseServerVoucherDateField(master.openingBalanceDate);
    for (const t of sorted) {
      const transactionDate = parseServerVoucherDateField(t?.date);
      if (!transactionDate) continue;
      if (openingBalanceDate && transactionDate < openingBalanceDate) continue;
      const amounts = getAccountLedgerTransactionAmounts(t, master.id);
      balance += amounts.debit - amounts.credit;
    }
    balances[master.id] = balance;
  }

  return balances;
}
