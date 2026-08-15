/**
 * Party ledger bill-wise auto link.
 *
 * Every DR/CR row of the ledger takes part, not only Sale/Purchase vs Receipt/Payment:
 * journal, inter-company and direct income/expense rows are netted the same way.
 * Rows are walked top-to-bottom in ledger order and each link is min(open DR, open CR),
 * so partial links are normal and any unused amount carries into lower rows.
 */
import { getInterCompanyEntityBillWiseAmount } from "@/lib/interCompany/interCompanyLedgerAmounts";
import {
  OPENING_BALANCE_VOUCHER_ID,
  getAllocationTotal,
  type Allocation,
} from "@/lib/payment-allocation-utils";

export type BillWiseAutoLinkSide = "dr" | "cr";

export type BillWiseAutoLinkProposalRow = {
  id: string;
  /** Ledger side of the source voucher. */
  side: BillWiseAutoLinkSide;
  sourceVoucherId: string;
  sourceVoucherNumber: string;
  sourceType: string;
  sourceLabel: string;
  targetVoucherId: string;
  targetVoucherNumber: string;
  targetType: string;
  targetLabel: string;
  amount: number;
  /** Journal / inter-company sources need the party id on the allocation. */
  linkedAccountId?: string;
  selected: boolean;
};

/** One unlinked voucher row shown in the auto-link DR/CR tables. */
export type BillWiseAutoLinkLedgerRow = {
  voucherId: string;
  voucherNumber: string;
  typeLabel: string;
  side: BillWiseAutoLinkSide;
  date: unknown;
  amount: number;
  /** Existing link amount before this proposal. */
  linked: number;
  /** Amount included by the currently generated proposal. */
  proposedLinked: number;
  /** Amount still due after this proposal. */
  balance: number;
};

export type BillWiseAutoLinkProposal = {
  ledgerId: string;
  ledgerName: string;
  fingerprint: string;
  /** Unlinked DR total before auto link. */
  drOpenTotal: number;
  /** Unlinked CR total before auto link. */
  crOpenTotal: number;
  /** Total that the proposal links. */
  linkableTotal: number;
  /** Balance left after the proposal (positive = DR, negative = CR). */
  closingBalance: number;
  ledgerRows: BillWiseAutoLinkLedgerRow[];
  rows: BillWiseAutoLinkProposalRow[];
};

function voucherTime(v: { date?: unknown }): number {
  if (!v?.date) return 0;
  const raw = (v.date as { toDate?: () => Date })?.toDate?.() ?? v.date;
  const t = new Date(raw as string | number | Date).getTime();
  return Number.isFinite(t) ? t : 0;
}

function voucherLabel(v: { voucherNumber?: string; invoiceNumber?: string; id?: string }): string {
  return String(v.voucherNumber || v.invoiceNumber || v.id || "—");
}

function roundMoney(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function isActiveVoucher(v: any): boolean {
  if (!v || v.isDeleted || v.deleted) return false;
  if (v.approvalStatus === "rejected" || v.status === "rejected") return false;
  return true;
}

/** Party-side Dr/Cr of a manual journal line. */
function journalLedgerAmount(v: any, ledgerId: string): { debit: number; credit: number; total: number } | null {
  if (v?.type !== "journal" || !Array.isArray(v?.entries)) return null;
  // Journal data has existed in more than one shape (accountId in current rows,
  // ledgerId/partyId in imported or older local records). All are the same
  // party-side ledger line for bill-wise purposes.
  const entry = v.entries.find((e: any) => {
    const ids = [e?.accountId, e?.ledgerId, e?.partyId, e?.entityId, e?.id];
    return ids.some((id) => String(id ?? "") === ledgerId);
  });
  if (!entry) return null;
  const debit = Number(entry.debit) || 0;
  const credit = Number(entry.credit) || 0;
  const total = debit > 0 ? debit : credit;
  if (total <= 0) return null;
  return { debit, credit, total };
}

/** Does this voucher show up on the party ledger at all (partyId, journal entry or inter-company leg)? */
export function voucherTouchesLedger(
  v: any,
  ledgerId: string,
  ledgerKind: "party" | "staff" = "party"
): boolean {
  if (!v || !ledgerId) return false;
  const entityField = ledgerKind === "staff" ? "staffId" : "partyId";
  if (String(v[entityField] || "") === ledgerId) return true;
  if (v.type === "journal") return !!journalLedgerAmount(v, ledgerId);
  if (v.type === "inter_company") {
    return !!getInterCompanyEntityBillWiseAmount(v, ledgerId, ledgerKind);
  }
  return false;
}

type LedgerRow = {
  voucher: any;
  voucherId: string;
  voucherNumber: string;
  type: string;
  typeLabel: string;
  side: BillWiseAutoLinkSide;
  amount: number;
  linked: number;
  remaining: number;
  time: number;
  /** Lower value = better allocation holder (source). */
  sourceRank: number;
  needsLinkedAccountId: boolean;
};

/**
 * Ledger row for one voucher: side (Dr/Cr), party-side amount and the part
 * that is still not linked. Returns null when the voucher is not bill-wise linkable here.
 */
function buildLedgerRow(
  v: any,
  ledgerId: string,
  inboundAllocated: Map<string, number>,
  ledgerVoucherIds: Set<string>,
  ledgerKind: "party" | "staff"
): LedgerRow | null {
  const type = String(v?.type ?? "");
  const entityField = ledgerKind === "staff" ? "staffId" : "partyId";
  const isLedgerEntity = String(v?.[entityField] ?? "") === ledgerId;

  let side: BillWiseAutoLinkSide | null = null;
  let amount = 0;
  let typeLabel = "";
  let needsLinkedAccountId = false;
  let sourceRank = 3;

  if (isLedgerEntity && (type === "sale" || type === "sale_service")) {
    side = "dr";
    amount = Number(v.total ?? v.amount ?? 0);
    typeLabel = "Sale";
  } else if (isLedgerEntity && (type === "purchase" || type === "purchase_service")) {
    side = "cr";
    amount = Number(v.total ?? v.amount ?? 0);
    typeLabel = "Purchase";
  } else if (isLedgerEntity && (type === "payment_in" || type === "direct_income")) {
    side = "cr";
    amount = Number(v.amount ?? v.total ?? 0);
    typeLabel = type === "payment_in" ? "Receipt" : "Direct Income";
    sourceRank = 0;
  } else if (isLedgerEntity && (type === "payment_out" || type === "direct_expense")) {
    side = "dr";
    amount = Number(v.amount ?? v.total ?? 0);
    typeLabel = type === "payment_out" ? "Payment" : "Direct Expense";
    sourceRank = 0;
  } else if (type === "journal") {
    const ledgerAmount = journalLedgerAmount(v, ledgerId);
    if (!ledgerAmount) return null;
    side = ledgerAmount.debit > 0 ? "dr" : "cr";
    amount = ledgerAmount.total;
    typeLabel =
      v.subType === "add_salary"
        ? ledgerAmount.debit > 0
          ? "Add Salary (Dr)"
          : "Add Salary (Cr)"
        : ledgerAmount.debit > 0
          ? "Journal (Dr)"
          : "Journal (Cr)";
    needsLinkedAccountId = true;
    sourceRank = 1;
  } else if (type === "inter_company") {
    const ledgerAmount = getInterCompanyEntityBillWiseAmount(v, ledgerId, ledgerKind);
    if (!ledgerAmount) return null;
    side = ledgerAmount.debit > 0 ? "dr" : "cr";
    amount = ledgerAmount.total;
    typeLabel = ledgerAmount.debit > 0 ? "Inter Company (Dr)" : "Inter Company (Cr)";
    needsLinkedAccountId = true;
    // Inter-company rows are preferred as target, not as allocation holder.
    sourceRank = 4;
  }

  if (!side || !(amount > 0)) return null;

  const own = (v.allocations as Allocation[] | undefined) || [];
  // A journal / inter-company voucher also sits on other accounts' ledgers, so its
  // allocations can belong to a different ledger. Counting those here made an
  // unlinked row look fully settled on this party.
  const ownAllocated = own.reduce((sum, a) => {
    if (!allocationBelongsToLedger(a, ledgerId, ledgerVoucherIds)) return sum;
    return sum + getAllocationTotal(a);
  }, 0);
  const obInAllocations = own
    .filter((a) => String(a?.voucherId ?? "") === OPENING_BALANCE_VOUCHER_ID)
    .reduce((s, a) => s + getAllocationTotal(a), 0);
  const openingBalanceAllocated = Math.max(
    0,
    (Number(v.openingBalanceAllocated) || 0) - obInAllocations
  );
  // Both sides of a link record it, so take the larger of own vs inbound instead of summing.
  const allocated =
    Math.max(ownAllocated, inboundAllocated.get(String(v.id)) ?? 0) + openingBalanceAllocated;

  const remaining = roundMoney(Math.max(0, amount - allocated));

  return {
    voucher: v,
    voucherId: String(v.id),
    voucherNumber: voucherLabel(v),
    type,
    typeLabel,
    side,
    amount: roundMoney(amount),
    linked: roundMoney(allocated),
    remaining,
    time: voucherTime(v),
    sourceRank,
    needsLinkedAccountId,
  };
}

/** Is this allocation a bill-wise link on the ledger we are auto-linking? */
function allocationBelongsToLedger(
  a: Allocation | null | undefined,
  ledgerId: string,
  ledgerVoucherIds: Set<string>
): boolean {
  const linkedId = String((a as { linkedAccountId?: string } | null)?.linkedAccountId ?? "");
  if (linkedId) return linkedId === ledgerId;
  const target = String(a?.voucherId ?? "");
  if (!target) return false;
  if (target === OPENING_BALANCE_VOUCHER_ID) return true;
  return ledgerVoucherIds.has(target);
}

/** Allocations pointing at each voucher, counted only within this ledger. */
function buildInboundAllocatedMap(
  ledgerVouchers: any[],
  ledgerId: string,
  ledgerVoucherIds: Set<string>
): Map<string, number> {
  const map = new Map<string, number>();
  for (const v of ledgerVouchers) {
    const allocations = (v.allocations as Allocation[] | undefined) || [];
    for (const a of allocations) {
      const target = String(a?.voucherId ?? "");
      if (!target || target === OPENING_BALANCE_VOUCHER_ID) continue;
      if (!ledgerVoucherIds.has(target)) continue;
      if (!allocationBelongsToLedger(a, ledgerId, ledgerVoucherIds)) continue;
      map.set(target, (map.get(target) ?? 0) + getAllocationTotal(a));
    }
  }
  return map;
}

/** Of a Dr/Cr pair, the row that should carry the allocation array. */
function pickSource(a: LedgerRow, b: LedgerRow): { source: LedgerRow; target: LedgerRow } {
  if (a.sourceRank !== b.sourceRank) {
    return a.sourceRank < b.sourceRank ? { source: a, target: b } : { source: b, target: a };
  }
  // Same kind of row: the later one settles the earlier one.
  if (a.time !== b.time) return a.time > b.time ? { source: a, target: b } : { source: b, target: a };
  return a.voucherId > b.voucherId ? { source: a, target: b } : { source: b, target: a };
}

/**
 * Build the chronological netting proposal for one party ledger.
 * Amounts never need to match: a big row is linked to as many opposite rows as needed,
 * upward first (older open rows) and then downward into newer rows.
 */
export function buildPartyBillWiseAutoLinkProposal(opts: {
  ledgerId: string;
  ledgerName: string;
  vouchers: any[];
  ledgerKind?: "party" | "staff";
}): BillWiseAutoLinkProposal | null {
  const { ledgerName, vouchers } = opts;
  const ledgerKind = opts.ledgerKind ?? "party";
  const ledgerId = String(opts.ledgerId || "");
  if (!ledgerId || !Array.isArray(vouchers) || vouchers.length === 0) return null;

  const activeVouchers = vouchers.filter(isActiveVoucher);
  const ledgerVouchers = activeVouchers.filter((v) => voucherTouchesLedger(v, ledgerId, ledgerKind));
  const ledgerVoucherIds = new Set(ledgerVouchers.map((v) => String(v?.id ?? "")));
  const inboundAllocated = buildInboundAllocatedMap(ledgerVouchers, ledgerId, ledgerVoucherIds);

  const ledgerRows = ledgerVouchers
    .map((v) => buildLedgerRow(v, ledgerId, inboundAllocated, ledgerVoucherIds, ledgerKind))
    .filter((row): row is LedgerRow => !!row)
    .sort((a, b) => a.time - b.time || a.voucherId.localeCompare(b.voucherId));

  if (!ledgerRows.length) return null;

  const drOpenTotal = roundMoney(
    ledgerRows.filter((r) => r.side === "dr").reduce((s, r) => s + r.remaining, 0)
  );
  const crOpenTotal = roundMoney(
    ledgerRows.filter((r) => r.side === "cr").reduce((s, r) => s + r.remaining, 0)
  );

  const openDr: LedgerRow[] = [];
  const openCr: LedgerRow[] = [];
  const rows: BillWiseAutoLinkProposalRow[] = [];

  const link = (drRow: LedgerRow, crRow: LedgerRow) => {
    const amount = roundMoney(Math.min(drRow.remaining, crRow.remaining));
    if (amount <= 0) return;
    drRow.remaining = roundMoney(drRow.remaining - amount);
    crRow.remaining = roundMoney(crRow.remaining - amount);
    const { source, target } = pickSource(drRow, crRow);
    rows.push({
      id: `${source.voucherId}:${target.voucherId}:${rows.length}`,
      side: source.side,
      sourceVoucherId: source.voucherId,
      sourceVoucherNumber: source.voucherNumber,
      sourceType: source.type,
      sourceLabel: source.typeLabel,
      targetVoucherId: target.voucherId,
      targetVoucherNumber: target.voucherNumber,
      targetType: target.type,
      targetLabel: target.typeLabel,
      amount,
      linkedAccountId: source.needsLinkedAccountId ? ledgerId : undefined,
      selected: true,
    });
  };

  for (const row of ledgerRows) {
    if (row.remaining <= 0) continue;
    const opposite = row.side === "dr" ? openCr : openDr;
    while (row.remaining > 0 && opposite.length > 0) {
      const other = opposite[0];
      if (row.side === "dr") link(row, other);
      else link(other, row);
      if (other.remaining <= 0) opposite.shift();
    }
    if (row.remaining > 0) (row.side === "dr" ? openDr : openCr).push(row);
  }

  const linkableTotal = roundMoney(rows.reduce((s, r) => s + r.amount, 0));
  const closingBalance = roundMoney(
    openDr.reduce((s, r) => s + r.remaining, 0) - openCr.reduce((s, r) => s + r.remaining, 0)
  );

  const fingerprint = rows
    .map((r) => `${r.sourceVoucherId}>${r.targetVoucherId}:${r.amount}`)
    .sort()
    .join("|");
  const proposedByVoucherId = new Map<string, number>();
  for (const row of rows) {
    proposedByVoucherId.set(
      row.sourceVoucherId,
      roundMoney((proposedByVoucherId.get(row.sourceVoucherId) ?? 0) + row.amount)
    );
    proposedByVoucherId.set(
      row.targetVoucherId,
      roundMoney((proposedByVoucherId.get(row.targetVoucherId) ?? 0) + row.amount)
    );
  }
  const displayLedgerRows: BillWiseAutoLinkLedgerRow[] = ledgerRows
    .map((row) => {
      const proposedLinked = proposedByVoucherId.get(row.voucherId) ?? 0;
      return {
        voucherId: row.voucherId,
        voucherNumber: row.voucherNumber,
        typeLabel: row.typeLabel,
        side: row.side,
        date: row.voucher.date,
        amount: row.amount,
        linked: row.linked,
        proposedLinked,
        balance: roundMoney(Math.max(0, row.amount - row.linked - proposedLinked)),
      };
    })
    .sort((a, b) => {
      const voucherA = activeVouchers.find((v) => String(v?.id ?? "") === a.voucherId);
      const voucherB = activeVouchers.find((v) => String(v?.id ?? "") === b.voucherId);
      return voucherTime(voucherA) - voucherTime(voucherB) || a.voucherId.localeCompare(b.voucherId);
    });

  return {
    ledgerId,
    ledgerName,
    fingerprint,
    drOpenTotal,
    crOpenTotal,
    linkableTotal,
    closingBalance,
    ledgerRows: displayLedgerRows,
    rows,
  };
}

function sameAllocationSlot(existing: Allocation, row: { targetVoucherId: string; linkedAccountId?: string }): boolean {
  if (String(existing?.voucherId ?? "") !== row.targetVoucherId) return false;
  const existingLinked = String((existing as any)?.linkedAccountId ?? "");
  if (existingLinked !== String(row.linkedAccountId ?? "")) return false;
  // Salary-style split allocations are left untouched; add a separate entry instead.
  return !(
    Number((existing as any)?.taxableAmount) ||
    Number((existing as any)?.taxAmount) ||
    Number((existing as any)?.netAmount)
  );
}

/** Group selected proposal rows into source voucher → allocations (merged with existing). */
export function groupSelectedAutoLinkAllocations(
  rows: BillWiseAutoLinkProposalRow[],
  vouchers: any[]
): Array<{ source: any; allocations: Allocation[] }> {
  const bySource = new Map<string, BillWiseAutoLinkProposalRow[]>();
  for (const row of rows) {
    if (!row.selected || row.amount <= 0) continue;
    const list = bySource.get(row.sourceVoucherId) || [];
    list.push(row);
    bySource.set(row.sourceVoucherId, list);
  }

  const out: Array<{ source: any; allocations: Allocation[] }> = [];
  for (const [sourceId, newRows] of bySource) {
    const source = vouchers.find((v) => String(v?.id ?? "") === sourceId);
    if (!source) continue;
    const allocations: Allocation[] = (
      Array.isArray(source.allocations) ? (source.allocations as Allocation[]) : []
    ).map((a) => ({ ...a }));

    for (const row of newRows) {
      const existing = allocations.find((a) => sameAllocationSlot(a, row));
      if (existing) {
        existing.amount = roundMoney((Number(existing.amount) || 0) + row.amount);
        continue;
      }
      const alloc: Allocation = { voucherId: row.targetVoucherId, amount: roundMoney(row.amount) };
      if (row.linkedAccountId) alloc.linkedAccountId = row.linkedAccountId;
      allocations.push(alloc);
    }

    out.push({
      source,
      allocations: allocations.filter((a) => getAllocationTotal(a) > 0),
    });
  }
  return out;
}
