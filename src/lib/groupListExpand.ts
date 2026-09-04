import type { EntityListQuickFilter } from "@/components/entity/EntityListQuickFilterBar";
import { masterEntityTextMatchesSearch } from "@/lib/filterMasterEntityListRows";

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

const epsSettled = 1e-6;

function isGroupListAmountSettled(n: unknown): boolean {
  const v = Number(n);
  if (Number.isNaN(v)) return false;
  return Math.abs(v) < epsSettled;
}

/** Footer quick filter — hide rows that do not match Dr/Cr/Settled (same as flat account lists). */
export function filterGroupListMembersByQuickFilter<T extends GroupListSortableMember>(
  rows: T[],
  quickFilter: EntityListQuickFilter
): T[] {
  if (
    quickFilter === "default" ||
    quickFilter === "name" ||
    quickFilter === "date"
  ) {
    return rows;
  }
  return rows.filter((row) => {
    const balRaw = row.balance;
    const bal = typeof balRaw === "number" && !Number.isNaN(balRaw) ? balRaw : null;
    if (quickFilter === "dr") return bal !== null && bal > 0;
    if (quickFilter === "cr") return bal !== null && bal < 0;
    if (quickFilter === "settled") return bal !== null && isGroupListAmountSettled(bal);
    if (quickFilter === "non_settled") return bal === null || !isGroupListAmountSettled(bal);
    return true;
  });
}

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

/** Search mode — sirf naam match wale accounts; group name match se saare accounts mat dikhao. */
export function filterGroupListMembersBySearch<T extends { name?: string }>(
  rows: T[],
  searchTerm: string
): T[] {
  if (!String(searchTerm || "").trim()) return rows;
  return rows.filter((row) => masterEntityTextMatchesSearch(row.name, searchTerm));
}

export function groupListMembersForDisplay<T extends GroupListSortableMember & { name?: string }>(
  rows: T[],
  quickFilter: EntityListQuickFilter,
  searchTerm: string,
  nameOf?: (row: T) => string
): T[] {
  const filtered = filterGroupListMembersByQuickFilter(rows, quickFilter);
  const sorted = sortGroupListMembers(filtered, quickFilter, nameOf);
  return filterGroupListMembersBySearch(sorted, searchTerm);
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
