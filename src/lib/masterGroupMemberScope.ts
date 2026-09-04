import { collectMasterGroupDescendantIds, type MasterGroupListRow } from "@/lib/masterGroupListTree";

type GroupRow = MasterGroupListRow;

/** User group ids nested directly under a system branch (all depths). */
export function collectMasterGroupUserGroupIdsUnderBranch(
  branchId: string,
  allGroups: GroupRow[],
  isSystemGroupId: (id: string) => boolean
): Set<string> {
  const out = new Set<string>();
  for (const g of allGroups) {
    if (!g?.id || isSystemGroupId(g.id)) continue;
    const parentId = String(g.parentId || "").trim();
    if (parentId !== branchId) continue;
    out.add(g.id);
    collectMasterGroupDescendantIds(g.id, allGroups).forEach((id) => out.add(id));
  }
  return out;
}

/** Selected group id + all nested child group ids (not for system branches). */
export function collectMasterGroupScopeBucketIds(
  scopeGroupId: string,
  allGroups: GroupRow[],
  isSystemGroupId: (id: string) => boolean
): Set<string> {
  if (isSystemGroupId(scopeGroupId)) {
    return collectMasterGroupUserGroupIdsUnderBranch(scopeGroupId, allGroups, isSystemGroupId);
  }
  const out = new Set<string>([scopeGroupId]);
  collectMasterGroupDescendantIds(scopeGroupId, allGroups).forEach((id) => out.add(id));
  return out;
}

export function memberInMasterGroupScope<T extends { groupId?: string | null }>(
  member: T,
  scopeGroupId: string,
  allGroups: GroupRow[],
  resolveBucketId: (member: T) => string,
  isSystemGroupId: (id: string) => boolean,
  isDirectOnSystemBranch?: (member: T, branchId: string) => boolean
): boolean {
  if (isSystemGroupId(scopeGroupId)) {
    if (isDirectOnSystemBranch?.(member, scopeGroupId)) {
      return resolveBucketId(member) === scopeGroupId;
    }
    const nestedIds = collectMasterGroupUserGroupIdsUnderBranch(
      scopeGroupId,
      allGroups,
      isSystemGroupId
    );
    return nestedIds.has(resolveBucketId(member));
  }

  const scopeIds = collectMasterGroupScopeBucketIds(scopeGroupId, allGroups, isSystemGroupId);
  return scopeIds.has(resolveBucketId(member));
}

export function filterMembersByMasterGroupScope<T extends { groupId?: string | null }>(
  scopeGroupId: string,
  members: T[],
  allGroups: GroupRow[],
  resolveBucketId: (member: T) => string,
  isSystemGroupId: (id: string) => boolean,
  isDirectOnSystemBranch?: (member: T, branchId: string) => boolean
): T[] {
  return members.filter((member) =>
    memberInMasterGroupScope(
      member,
      scopeGroupId,
      allGroups,
      resolveBucketId,
      isSystemGroupId,
      isDirectOnSystemBranch
    )
  );
}
