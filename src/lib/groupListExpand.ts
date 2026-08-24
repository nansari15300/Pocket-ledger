import type { EntityListQuickFilter } from "@/components/entity/EntityListQuickFilterBar";

export const GROUP_LIST_CHILD_INDENT_CLASS = "pl-[10px]";

export function getEntityListInitials(name: string): string {
  if (!name) return "NA";
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export type GroupListSortableMember = {
  name?: string;
  balance?: number;
  openingBalanceDate?: unknown;
};

function openingDateMs(raw: unknown): number {
  if (!raw) return 0;
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? 0 : raw.getTime();
  if (typeof (raw as { toDate?: () => Date }).toDate === "function") {
    const d = (raw as { toDate: () => Date }).toDate();
    return Number.isNaN(d.getTime()) ? 0 : d.getTime();
  }
  const d = new Date(raw as string | number);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

export function compareGroupListMembers<T extends GroupListSortableMember>(
  a: T,
  b: T,
  quickFilter: EntityListQuickFilter,
  nameOf?: (row: T) => string
): number {
  if (quickFilter === "name") {
    const na = nameOf?.(a) ?? String(a.name || "");
    const nb = nameOf?.(b) ?? String(b.name || "");
    return na.localeCompare(nb);
  }
  if (quickFilter === "date") {
    return openingDateMs(b.openingBalanceDate) - openingDateMs(a.openingBalanceDate);
  }
  return Math.abs(Number(b.balance || 0)) - Math.abs(Number(a.balance || 0));
}

export function sortGroupListMembers<T extends GroupListSortableMember>(
  rows: T[],
  quickFilter: EntityListQuickFilter,
  nameOf?: (row: T) => string
): T[] {
  return [...rows].sort((a, b) => compareGroupListMembers(a, b, quickFilter, nameOf));
}

export type GroupListSelectOptions = { memberId?: string | null };

/** Accordion: opening one group collapses any other expanded group in the same list. */
export function toggleGroupListAccordionExpand(
  currentExpandedId: string | null,
  targetId: string
): string | null {
  return currentExpandedId === targetId ? null : targetId;
}

export const IC_PEER_LIST_EXPAND_PREFIX = "ic-peer:";

export function icPeerListExpandKey(peerCompanyId: string): string {
  return `${IC_PEER_LIST_EXPAND_PREFIX}${peerCompanyId}`;
}

export function parseIcPeerListExpandKey(key: string | null | undefined): string | null {
  if (!key?.startsWith(IC_PEER_LIST_EXPAND_PREFIX)) return null;
  const peerId = key.slice(IC_PEER_LIST_EXPAND_PREFIX.length);
  return peerId || null;
}

export function isIcListLevel1Expanded(
  expandedListNodeId: string | null,
  icGroupId: string
): boolean {
  return (
    expandedListNodeId === icGroupId ||
    parseIcPeerListExpandKey(expandedListNodeId) != null
  );
}
