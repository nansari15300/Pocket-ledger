/**
 * Party list / group totals: balance wahi ledger math se jo `useTransactions(..., "party")` closing balance.
 * Pehle `useVouchers` voucherAggregates alag rules use karta tha (IC bank visibility, contra miss, journal sab maps).
 */
import { resolveInterCompanyLegsForVoucher } from "@/lib/interCompany/interCompanyPostingLegs";
import {
  getInterCompanyLedgerAmounts,
  hideUnapprovedTargetInterCompanyEntityLedger,
} from "@/lib/interCompany/interCompanyLedgerAmounts";
import { sumJournalAmountsForAccount } from "@/lib/journalLedgerAmounts";
import { voucherTouchesPartyLedger } from "@/lib/voucherTouchesPartyLedger";

export type PartyLedgerDebitCredit = { debit: number; credit: number };

function toNum(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const n = Number(value.replace(/,/g, "").trim());
    return Number.isFinite(n) ? n : 0;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** `getTransactionAmounts` party branch + inter_company tail — circular import avoid. */
export function getPartyLedgerTransactionAmounts(transaction: any, partyId: string): PartyLedgerDebitCredit {
  let debit = 0;
  let credit = 0;
  const amount = toNum(transaction?.total ?? transaction?.amount ?? 0);

  if (String(transaction?.partyId ?? "") === partyId) {
    if (["sale", "sale_service", "payment_out", "direct_income"].includes(transaction.type)) debit += amount;
    if (["purchase", "purchase_service", "payment_in", "direct_expense"].includes(transaction.type)) credit += amount;
  }

  if (
    transaction?.type === "contra" &&
    (transaction.fromAccountId === partyId || transaction.toAccountId === partyId)
  ) {
    if (transaction.toAccountId === partyId) debit += amount;
    if (transaction.fromAccountId === partyId) credit += amount;
  }

  if (transaction?.type === "journal" && Array.isArray(transaction.entries)) {
    const journalAmt = sumJournalAmountsForAccount(transaction.entries, partyId);
    debit += journalAmt.debit;
    credit += journalAmt.credit;
  }

  if (String(transaction?.type || "") === "inter_company") {
    const ic = getInterCompanyLedgerAmounts(transaction, "party", partyId, amount);
    if (ic.touched) {
      debit = ic.debit;
      credit = ic.credit;
    }
  }

  return { debit, credit };
}

export function voucherMatchesPartyLedgerForBalance(v: any, partyId: string): boolean {
  if (!v || !partyId) return false;
  if (hideUnapprovedTargetInterCompanyEntityLedger(v, "party", partyId)) return false;
  return voucherTouchesPartyLedger(v, partyId);
}

function collectPartyIdCandidatesFromVoucher(v: any, partyIdSet: Set<string>): Set<string> {
  const out = new Set<string>();
  const bump = (id: unknown) => {
    const s = String(id ?? "").trim();
    if (s && partyIdSet.has(s)) out.add(s);
  };
  bump(v?.partyId);
  bump(v?.accountId);
  bump(v?.fromAccountId);
  bump(v?.toAccountId);
  bump(v?.staffId);
  bump(v?.taxAccountId);
  bump(v?.expenseAccountId);
  bump(v?.incomeAccountId);
  bump(v?.salesAccountId);
  bump(v?.purchaseAccountId);
  if (Array.isArray(v?.lineItems)) {
    for (const li of v.lineItems) {
      bump(li?.itemId);
      bump(li?.taxAccountId);
    }
  }
  if (Array.isArray(v?.items)) {
    for (const li of v.items) bump(li?.itemId);
  }
  if (Array.isArray(v?.entries)) {
    for (const e of v.entries) bump(e?.accountId);
  }
  if (v?.type === "note") bump(v?.entityId);
  if (String(v?.type || "") === "inter_company") {
    const legs = resolveInterCompanyLegsForVoucher(v as Record<string, unknown>);
    for (const leg of legs) {
      if (leg.kind === "party") bump(leg.accountId);
    }
    bump(v?.sourceEntityId);
    bump(v?.targetEntityId);
    bump(v?.interCompanyCounterpartyPartyId);
  }
  return out;
}

function addVal(
  map: Map<string, PartyLedgerDebitCredit>,
  id: string,
  type: "debit" | "credit",
  val: number
) {
  if (!id || !Number.isFinite(val) || val === 0) return;
  const current = map.get(id) || { debit: 0, credit: 0 };
  if (type === "debit") current.debit += val;
  else current.credit += val;
  map.set(id, current);
}

/** Ek voucher se party list balance map update — ledger closing jaisa. */
export function accumulatePartyLedgerAmountsForVoucher(
  v: any,
  partyMap: Map<string, PartyLedgerDebitCredit>,
  partyIdSet: Set<string>
) {
  const candidates = collectPartyIdCandidatesFromVoucher(v, partyIdSet);
  for (const partyId of candidates) {
    if (!voucherMatchesPartyLedgerForBalance(v, partyId)) continue;
    const amounts = getPartyLedgerTransactionAmounts(v, partyId);
    if (amounts.debit === 0 && amounts.credit === 0 && v?.type !== "note") continue;
    addVal(partyMap, partyId, "debit", amounts.debit);
    addVal(partyMap, partyId, "credit", amounts.credit);
  }
}

export function buildPartyLedgerAggregateMap(
  vouchers: any[],
  partyIdSet: Set<string>
): Map<string, PartyLedgerDebitCredit> {
  const partyMap = new Map<string, PartyLedgerDebitCredit>();
  for (const v of vouchers) {
    accumulatePartyLedgerAmountsForVoucher(v, partyMap, partyIdSet);
  }
  return partyMap;
}
