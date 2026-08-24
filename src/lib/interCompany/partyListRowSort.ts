import type { Party } from "@/components/party/types";
import type { EntityListQuickFilter } from "@/components/entity/EntityListQuickFilterBar";
import { interCompanyClearingAccountDisplayName } from "@/lib/interCompany/icPeerCompanyGroups";

function partyOpeningDateMs(raw: unknown): number {
  if (!raw) return 0;
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? 0 : raw.getTime();
  if (typeof (raw as { toDate?: () => Date }).toDate === "function") {
    const d = (raw as { toDate: () => Date }).toDate();
    return Number.isNaN(d.getTime()) ? 0 : d.getTime();
  }
  const d = new Date(raw as any);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

export function comparePartyListRows(
  a: Party,
  b: Party,
  quickFilter: EntityListQuickFilter
): number {
  if (quickFilter === "name") return String(a.name || "").localeCompare(String(b.name || ""));
  if (quickFilter === "date") {
    return partyOpeningDateMs(b.openingBalanceDate) - partyOpeningDateMs(a.openingBalanceDate);
  }
  return Math.abs(Number(b.balance || 0)) - Math.abs(Number(a.balance || 0));
}

export function sortPartyListRows(rows: Party[], quickFilter: EntityListQuickFilter): Party[] {
  return [...rows].sort((a, b) => comparePartyListRows(a, b, quickFilter));
}

export function compareIcMemberRows(
  a: Party,
  b: Party,
  quickFilter: EntityListQuickFilter
): number {
  if (quickFilter === "name") {
    return interCompanyClearingAccountDisplayName(a).localeCompare(
      interCompanyClearingAccountDisplayName(b)
    );
  }
  return comparePartyListRows(a, b, quickFilter);
}

export function sortIcMemberParties(rows: Party[], quickFilter: EntityListQuickFilter): Party[] {
  return [...rows].sort((a, b) => compareIcMemberRows(a, b, quickFilter));
}
