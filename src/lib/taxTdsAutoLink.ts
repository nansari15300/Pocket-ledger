/**
 * Tax page (TDS ledger) "Link for Bill Wise": link unlinked Dr entries on the tax account
 * (manual journals / TDS journals / payment-out with this tax account) against unpaid TDS Cr legs, oldest first.
 * Uses the same allocation shape as the Link dialog for tax/TDS legs:
 *   { voucherId: <TDS bill>, amount, taxAmount, linkedAccountId: <tax id>, entityTxnId: `<bill>::tds|tax::<tax id>` }
 * written through the same apply* helpers as party/staff auto link (bilateral sync + live patch).
 */
import {
  buildBillWiseEntityTxnId,
  getAllocationAmountForEntityScope,
  getJournalRemainingForTax,
  getJournalTaxDrAmount,
  getPaymentOutRemaining,
  type Allocation,
} from "@/lib/payment-allocation-utils";
import {
  applyJournalBillWiseLinkAllocations,
  applyPaymentBillWiseLinkAllocations,
  reconcileTdsLegLinks,
} from "@/lib/writeGateway/voucherActionsClient";
import { taxAccountIsTdsVerifyLegOnVoucher } from "@/lib/partyLedgerTdsView";

export type TaxTdsAutoLinkRow = {
  id: string;
  sourceId: string;
  sourceNo: string;
  sourceType: string;
  targetId: string;
  targetNo: string;
  targetType: string;
  amount: number;
  entityKind: "tds" | "tax";
};

export type TaxTdsAutoLinkProposal = {
  taxId: string;
  rows: TaxTdsAutoLinkRow[];
  total: number;
};

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

function timeOf(v: { date?: unknown }): number {
  const raw = (v?.date as { toDate?: () => Date })?.toDate?.() ?? v?.date;
  const t = raw ? new Date(raw as string | number | Date).getTime() : 0;
  return Number.isFinite(t) ? t : 0;
}

function numberOf(v: { voucherNumber?: string; invoiceNumber?: string; id?: string }): string {
  return String(v?.voucherNumber || v?.invoiceNumber || v?.id || "");
}

function isActive(v: any): boolean {
  if (!v || v.isDeleted || v.deleted) return false;
  return !(v.approvalStatus === "rejected" || v.status === "rejected");
}

export function buildTaxTdsAutoLinkProposal(opts: {
  vouchers: any[];
  /** Tax ledger rows (processedTransactions) used to find TDS Cr legs and their amounts. */
  taxRows: any[];
  taxId: string;
}): TaxTdsAutoLinkProposal | null {
  const taxId = String(opts.taxId || "").trim();
  if (!taxId) return null;
  const vouchers = (opts.vouchers || []).filter(isActive);
  const byId = new Map<string, any>(vouchers.map((v) => [String(v.id), v]));

  // Already allocated (tax portion) toward each target voucher, from every voucher's allocations.
  const allocatedTo = new Map<string, number>();
  for (const v of vouchers) {
    for (const a of (v.allocations as Allocation[] | undefined) || []) {
      const tid = String(a?.voucherId ?? "");
      const target = byId.get(tid);
      if (!target) continue;
      const amt = Math.max(
        getAllocationAmountForEntityScope(a, { entityKind: "tds", accountId: taxId }, target),
        getAllocationAmountForEntityScope(a, { entityKind: "tax", accountId: taxId }, target)
      );
      if (amt > 0) allocatedTo.set(tid, round2((allocatedTo.get(tid) ?? 0) + amt));
    }
  }

  // Unpaid TDS Cr legs (sale/purchase/add salary), oldest first.
  const legAmount = new Map<string, number>();
  for (const row of opts.taxRows || []) {
    const id = String(row?.id ?? "");
    const target = byId.get(id);
    if (!target || target.type === "journal" || target.type === "adjustment") continue;
    if (!taxAccountIsTdsVerifyLegOnVoucher(row, taxId)) continue;
    const cr = Number(row?.credit) || 0;
    if (cr > 0) legAmount.set(id, round2((legAmount.get(id) ?? 0) + cr));
  }
  const targets = [...legAmount.entries()]
    .map(([id, amount]) => ({
      v: byId.get(id),
      id,
      remaining: round2(amount - (allocatedTo.get(id) ?? 0)),
    }))
    .filter((t) => t.remaining > 0)
    .sort((a, b) => timeOf(a.v) - timeOf(b.v));

  // Unlinked Dr sources on this tax account, oldest first.
  const sources = vouchers
    .map((v) => {
      if (v.type === "journal" && v.subType !== "add_salary") {
        if (getJournalTaxDrAmount(v, taxId) == null) return null;
        return { v, remaining: round2(getJournalRemainingForTax(v, taxId)) };
      }
      if ((v.type === "payment_out" || v.type === "direct_expense") && String(v.taxAccountId ?? "") === taxId) {
        return { v, remaining: round2(getPaymentOutRemaining(v)) };
      }
      return null;
    })
    .filter((s): s is { v: any; remaining: number } => !!s && s.remaining > 0)
    .sort((a, b) => timeOf(a.v) - timeOf(b.v));

  const rows: TaxTdsAutoLinkRow[] = [];
  let ti = 0;
  for (const s of sources) {
    while (s.remaining > 0 && ti < targets.length) {
      const t = targets[ti];
      const amount = round2(Math.min(s.remaining, t.remaining));
      if (amount > 0) {
        s.remaining = round2(s.remaining - amount);
        t.remaining = round2(t.remaining - amount);
        rows.push({
          id: `${s.v.id}:${t.id}`,
          sourceId: String(s.v.id),
          sourceNo: numberOf(s.v),
          sourceType: String(s.v.type ?? ""),
          targetId: t.id,
          targetNo: numberOf(t.v),
          targetType: String(t.v.type ?? ""),
          amount,
          entityKind: t.v.subType === "add_salary" ? "tax" : "tds",
        });
      }
      if (t.remaining <= 0) ti += 1;
    }
    if (ti >= targets.length) break;
  }
  if (!rows.length) return null;
  return { taxId, rows, total: round2(rows.reduce((x, r) => x + r.amount, 0)) };
}

export async function applyTaxTdsAutoLinkProposal(
  companyId: string,
  proposal: TaxTdsAutoLinkProposal,
  vouchers: any[]
): Promise<number> {
  const bySource = new Map<string, TaxTdsAutoLinkRow[]>();
  for (const r of proposal.rows) bySource.set(r.sourceId, [...(bySource.get(r.sourceId) ?? []), r]);
  let n = 0;
  for (const [sourceId, rows] of bySource) {
    const source = vouchers.find((v) => String(v?.id ?? "") === sourceId);
    if (!source) continue;
    const prev: Allocation[] = Array.isArray(source.allocations) ? [...source.allocations] : [];
    const next: Allocation[] = prev.map((a) => ({ ...a }));
    for (const r of rows) {
      const entityTxnId = buildBillWiseEntityTxnId({
        voucherId: r.targetId,
        entityKind: r.entityKind,
        accountId: proposal.taxId,
      });
      const existing = next.find(
        (a) => String(a?.voucherId ?? "") === r.targetId && String((a as any).entityTxnId ?? "") === entityTxnId
      );
      if (existing) {
        existing.amount = round2((Number(existing.amount) || 0) + r.amount);
        (existing as any).taxAmount = round2((Number((existing as any).taxAmount) || 0) + r.amount);
      } else {
        next.push({
          voucherId: r.targetId,
          amount: r.amount,
          taxAmount: r.amount,
          linkedAccountId: proposal.taxId,
          entityTxnId,
        });
      }
    }
    if (source.type === "journal") {
      await applyJournalBillWiseLinkAllocations(companyId, sourceId, next, prev, []);
    } else {
      await applyPaymentBillWiseLinkAllocations(companyId, { id: sourceId, allocations: prev }, next);
    }
    await reconcileTdsLegLinks(companyId, sourceId).catch(() => {});
    n += rows.length;
  }
  return n;
}