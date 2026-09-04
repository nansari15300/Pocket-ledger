import { isInterCompanyPartyListAccount } from "@/lib/interCompany/interCompanyCounterpartyPartyName";
import { collectMasterGroupDescendantIds } from "@/lib/masterGroupListTree";
import {
  isPartyDirectOnSystemBranch,
  isPartySystemGroupId,
  PARTY_SYSTEM_DEBTORS_ID,
  resolvePartyListGroupBucketId,
} from "@/lib/partySystemGroups";

type PartyGroupRow = { id: string; parentId?: string };

/** User group ids nested under a system branch (all depths). */
export function collectPartyUserGroupIdsUnderBranch(
  branchId: string,
  allGroups: PartyGroupRow[]
): Set<string> {
  const out = new Set<string>();
  for (const g of allGroups) {
    if (!g?.id || isPartySystemGroupId(g.id)) continue;
    const parentId = String(g.parentId || "").trim();
    if (parentId !== branchId) continue;
    out.add(g.id);
    collectMasterGroupDescendantIds(g.id, allGroups).forEach((id) => out.add(id));
  }
  return out;
}

/** Party group id + all nested child group ids (not for system branches). */
export function collectPartyGroupScopeBucketIds(
  scopeGroupId: string,
  allGroups: PartyGroupRow[]
): Set<string> {
  if (isPartySystemGroupId(scopeGroupId)) {
    return collectPartyUserGroupIdsUnderBranch(scopeGroupId, allGroups);
  }
  const out = new Set<string>([scopeGroupId]);
  collectMasterGroupDescendantIds(scopeGroupId, allGroups).forEach((id) => out.add(id));
  return out;
}

export function partyInPartyGroupScope(
  party: { groupId?: string | null },
  scopeGroupId: string,
  allGroups: PartyGroupRow[]
): boolean {
  if (isPartySystemGroupId(scopeGroupId)) {
    if (
      scopeGroupId === PARTY_SYSTEM_DEBTORS_ID &&
      isInterCompanyPartyListAccount(party)
    ) {
      return true;
    }
    if (isPartyDirectOnSystemBranch(party, scopeGroupId)) {
      return !isInterCompanyPartyListAccount(party);
    }
    const nestedIds = collectPartyUserGroupIdsUnderBranch(scopeGroupId, allGroups);
    return nestedIds.has(resolvePartyListGroupBucketId(party));
  }

  const scopeIds = collectPartyGroupScopeBucketIds(scopeGroupId, allGroups);
  return scopeIds.has(resolvePartyListGroupBucketId(party));
}

export function filterPartiesForPartyGroupScope<T extends { groupId?: string | null }>(
  scopeGroupId: string,
  parties: T[],
  allGroups: PartyGroupRow[]
): T[] {
  return parties.filter((party) => partyInPartyGroupScope(party, scopeGroupId, allGroups));
}
