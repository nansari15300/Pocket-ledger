"use client";

import { listVouchersFromBrowserDbByDateRange } from "@/lib/fyPagination/voucherQueries";
import type { FyDateRangeMs } from "@/lib/fyPagination/types";

const LINKABLE_TYPES = new Set([
  "sale",
  "purchase",
  "payment_in",
  "payment_out",
  "journal",
  "adjustment",
  "inter_company",
]);

function voucherTouchesParty(v: Record<string, unknown>, partyId: string): boolean {
  const pid = String(partyId || "").trim();
  if (!pid) return false;
  if (String(v.partyId || v.party_id || "").trim() === pid) return true;
  const entries = Array.isArray(v.entries) ? v.entries : [];
  return entries.some((e) => String((e as { accountId?: string }).accountId || "").trim() === pid);
}

export type PartyLinkCandidateStub = {
  id: string;
  date: unknown;
  type?: string;
};

/** Party bill-wise link targets in a date range (SQLite). */
export async function listPartyLinkCandidateStubsInRange(
  companyId: string,
  partyId: string,
  range: FyDateRangeMs
): Promise<PartyLinkCandidateStub[]> {
  if (!companyId || !partyId) return [];
  const rows = await listVouchersFromBrowserDbByDateRange(companyId, range);
  const out: PartyLinkCandidateStub[] = [];
  for (const v of rows) {
    const type = String(v.type || "").trim();
    if (!LINKABLE_TYPES.has(type)) continue;
    if (!voucherTouchesParty(v as Record<string, unknown>, partyId)) continue;
    const id = String(v.id || "").trim();
    if (!id) continue;
    out.push({ id, date: v.date, type });
  }
  return out;
}
