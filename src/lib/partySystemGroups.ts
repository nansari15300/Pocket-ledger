/** Party groups: only Sundry Debtors + Sundry Creditors are system parents (no Ungrouped bucket). */

export const PARTY_SYSTEM_DEBTORS_ID = "sundry_debtors";
export const PARTY_SYSTEM_CREDITORS_ID = "sundry_creditors";

/** New parties default — creditors (suppliers / payables). */
export const PARTY_DEFAULT_SYSTEM_GROUP_ID = PARTY_SYSTEM_CREDITORS_ID;

/** Add-party form default — Sundry Debtors (customers / receivables). */
export const PARTY_FORM_DEFAULT_ACCOUNT_TYPE_ID = PARTY_SYSTEM_DEBTORS_ID;

const PARTY_LEGACY_UNGROUPED = new Set(["ungrouped", "ungrouped_party"]);

export function isPartyLegacyUngroupedGroupId(id?: string | null): boolean {
  const g = String(id ?? "").trim();
  return !g || PARTY_LEGACY_UNGROUPED.has(g);
}

export function isPartySystemGroupId(id?: string | null): boolean {
  const g = String(id ?? "").trim();
  return g === PARTY_SYSTEM_DEBTORS_ID || g === PARTY_SYSTEM_CREDITORS_ID;
}

/** Save + list: legacy ungrouped / empty → Sundry Creditors. */
export function normalizePartyGroupIdForStorage(id?: string | null): string {
  if (isPartyLegacyUngroupedGroupId(id)) return PARTY_DEFAULT_SYSTEM_GROUP_ID;
  return String(id).trim();
}

export function normalizePartyGroupIdForForm(id?: string | null): string {
  return normalizePartyGroupIdForStorage(id);
}

/** Group list / pending badge bucket for a party row. */
export function resolvePartyListGroupBucketId(party: { groupId?: string | null }): string {
  return normalizePartyGroupIdForStorage(party.groupId);
}

export function partyBelongsToGroupBucket(
  party: { groupId?: string | null },
  bucketId: string
): boolean {
  return resolvePartyListGroupBucketId(party) === bucketId;
}

/** Party assigned directly on a system branch (not in a user sub-group). */
export function isPartyDirectOnSystemBranch(
  party: { groupId?: string | null },
  branchId: string
): boolean {
  const gid = String(party.groupId ?? "").trim();
  if (gid === branchId) return true;
  if (isPartyLegacyUngroupedGroupId(gid) && branchId === PARTY_DEFAULT_SYSTEM_GROUP_ID) return true;
  return false;
}

export const PARTY_SYSTEM_GROUP_OPTIONS = [
  { id: PARTY_SYSTEM_DEBTORS_ID, name: "Sundry Debtors" },
  { id: PARTY_SYSTEM_CREDITORS_ID, name: "Sundry Creditors" },
] as const;

/** Sidebar / detail selection — system branches are not in processedGroups rows. */
export function buildPartySystemBranchSelectionGroup(
  branchId: string,
  companyId: string,
  balance = 0
): { id: string; name: string; companyId: string; balance: number; debit: number; credit: number; parentId: string; isSystemReserved: boolean } {
  const branch = PARTY_SYSTEM_GROUP_OPTIONS.find((b) => b.id === branchId);
  return {
    id: branchId,
    name: branch?.name ?? branchId,
    companyId,
    balance,
    debit: 0,
    credit: 0,
    parentId: "",
    isSystemReserved: true,
  };
}

/** Resolve list click / URL ?selected= to a Group row for GroupDetails. */
export function resolvePartyGroupForSelection(
  groupId: string | null | undefined,
  processedGroups: Array<{ id: string; name: string; companyId?: string; balance?: number; debit?: number; credit?: number; parentId?: string }>,
  companyId: string
): (typeof processedGroups)[number] | ReturnType<typeof buildPartySystemBranchSelectionGroup> | null {
  const gid = String(groupId ?? "").trim();
  if (!gid) return null;
  const found = processedGroups.find((g) => g.id === gid);
  if (found) return found;
  if (isPartySystemGroupId(gid)) {
    return buildPartySystemBranchSelectionGroup(gid, companyId);
  }
  return null;
}
