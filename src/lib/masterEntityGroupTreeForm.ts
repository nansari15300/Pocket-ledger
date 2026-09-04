import type { MasterGroupListConfig, MasterGroupListRow } from "@/lib/masterGroupListTree";
import {
  collectMasterGroupDescendantIds,
  resolveMasterGroupBranchId,
} from "@/lib/masterGroupListTree";
import { LOAN_LIABILITY_GROUP_ID } from "@/modules/loans/constants/loanConstants";
import { STAFF_SYSTEM_GROUP_ID } from "@/lib/staffSystemGroups";

/** Form + account picker nested indent (px per level). */
export const MASTER_ENTITY_GROUP_TREE_INDENT_PX = 15;

export const MASTER_ENTITY_GROUP_STEPPED_DIRECT = "__entity_branch_direct__";
export const MASTER_ENTITY_GROUP_PENDING_PREFIX = "__entity_grp_pending__:";

export type MasterEntityGroupCreateChainSlot = {
  groupId?: string;
  pendingName?: string;
};

function groupSortKey<G extends MasterGroupListRow>(a: G, b: G) {
  const aSys = a.isSystemReserved ? 1 : 0;
  const bSys = b.isSystemReserved ? 1 : 0;
  if (aSys !== bSys) return aSys - bSys;
  return Math.abs(Number(a.balance) || 0) - Math.abs(Number(b.balance) || 0);
}

export function masterEntityGroupPendingSlotValue(name: string): string {
  return `${MASTER_ENTITY_GROUP_PENDING_PREFIX}${name}`;
}

export function parseMasterEntityGroupPendingSlotValue(value: string): string | null {
  if (!value.startsWith(MASTER_ENTITY_GROUP_PENDING_PREFIX)) return null;
  const name = value.slice(MASTER_ENTITY_GROUP_PENDING_PREFIX.length);
  return name || null;
}

export function isMasterEntityGroupCreateChainSlotEmpty(
  slot?: MasterEntityGroupCreateChainSlot
): boolean {
  return !slot?.groupId && !String(slot?.pendingName || "").trim();
}

export function trimTrailingEmptyCreateChainSlots(
  slots: MasterEntityGroupCreateChainSlot[]
): MasterEntityGroupCreateChainSlot[] {
  const next = [...slots];
  while (next.length > 0 && isMasterEntityGroupCreateChainSlotEmpty(next[next.length - 1])) {
    next.pop();
  }
  return next;
}

export function masterEntityGroupCreateChainPendingNames(
  slots: MasterEntityGroupCreateChainSlot[]
): string[] {
  return trimTrailingEmptyCreateChainSlots(slots)
    .map((s) => String(s.pendingName || "").trim())
    .filter(Boolean);
}

export function masterEntityGroupCreateChainGroupIds(
  slots: MasterEntityGroupCreateChainSlot[]
): string[] {
  return trimTrailingEmptyCreateChainSlots(slots)
    .map((s) => s.groupId)
    .filter((id): id is string => Boolean(id));
}

export function masterEntityGroupBranchParentIds(
  config: MasterGroupListConfig,
  branchId: string
): string[] {
  const branch = config.branches.find((b) => b.id === branchId);
  return branch?.rootParentIds ?? [branchId];
}

function isMasterEntityGroupTerminalParentId(
  parentId: string,
  config: MasterGroupListConfig
): boolean {
  const virtualRoots = config.virtualRootIds ?? new Set<string>();
  if (!parentId || virtualRoots.has(parentId)) return true;
  if (config.branches.some((b) => b.id === parentId)) return true;
  return config.branches.some((b) => b.rootParentIds.includes(parentId));
}

/** Edit open — system branch + ancestor ids (immediate parent chain, top = field 2). */
export function decodeMasterEntityGroupParentPath<G extends MasterGroupListRow>(
  group: G,
  allGroups: G[],
  config: MasterGroupListConfig,
  opts?: { legacyParentIds?: string[] }
): { systemBranch: string; parentPathIds: string[] } {
  // Staff system branch (`staff_system`) is nested under Loan & Liabilities in the staff module.
  if (
    group.id === STAFF_SYSTEM_GROUP_ID &&
    config.branches.some((b) => b.id === STAFF_SYSTEM_GROUP_ID)
  ) {
    return { systemBranch: LOAN_LIABILITY_GROUP_ID, parentPathIds: [] };
  }

  const parentId = String(group.parentId || "").trim();
  const legacy = opts?.legacyParentIds ?? [];
  const systemBranch = resolveMasterGroupBranchId(parentId, allGroups, config);

  if (!parentId || isMasterEntityGroupTerminalParentId(parentId, config)) {
    return { systemBranch, parentPathIds: [] };
  }

  if (legacy.includes(parentId)) {
    return { systemBranch, parentPathIds: [] };
  }

  const byId = new Map(allGroups.map((g) => [g.id, g]));
  const path: string[] = [];
  let walkId = parentId;
  const seen = new Set<string>();

  while (walkId && !seen.has(walkId)) {
    seen.add(walkId);
    if (legacy.includes(walkId)) break;
    path.unshift(walkId);
    const parent = byId.get(walkId);
    const pp = String(parent?.parentId || "").trim();
    if (!pp || isMasterEntityGroupTerminalParentId(pp, config) || legacy.includes(pp)) break;
    walkId = pp;
  }

  return { systemBranch, parentPathIds: path };
}

export function resolveMasterEntityGroupParentIdFromPath(
  systemBranch: string,
  parentPathIds: string[]
): string {
  const cleaned = parentPathIds.filter(Boolean);
  if (cleaned.length === 0) return systemBranch;
  return cleaned[cleaned.length - 1]!;
}

export function listMasterEntityGroupChildrenForParent<G extends MasterGroupListRow>(
  allGroups: G[],
  parentId: string,
  excludeGroupId?: string
): G[] {
  const exclude = new Set<string>();
  if (excludeGroupId) {
    exclude.add(excludeGroupId);
    collectMasterGroupDescendantIds(excludeGroupId, allGroups).forEach((id) => exclude.add(id));
  }
  return allGroups
    .filter((g) => {
      if (!g?.id || exclude.has(g.id)) return false;
      return String(g.parentId || "").trim() === parentId;
    })
    .sort(groupSortKey);
}

export function listMasterEntityGroupLevelOptions<G extends MasterGroupListRow>(
  allGroups: G[],
  config: MasterGroupListConfig,
  branch: string,
  parentPathIds: string[],
  levelIndex: number,
  excludeGroupId?: string,
  opts?: { legacyParentIds?: string[] }
): G[] {
  if (levelIndex === 0) {
    const branchParents = masterEntityGroupBranchParentIds(config, branch);
    const legacy = opts?.legacyParentIds ?? [];
    const exclude = new Set<string>();
    if (excludeGroupId) {
      exclude.add(excludeGroupId);
      collectMasterGroupDescendantIds(excludeGroupId, allGroups).forEach((id) => exclude.add(id));
    }
    return allGroups
      .filter((g) => {
        if (!g?.id || exclude.has(g.id)) return false;
        const pid = String(g.parentId || "").trim();
        if (branchParents.includes(pid)) return true;
        if (legacy.length > 0 && legacy.includes(pid)) {
          const groupBranch = resolveMasterGroupBranchId(pid, allGroups, config);
          return groupBranch === branch;
        }
        return false;
      })
      .sort(groupSortKey);
  }
  const parentId = parentPathIds[levelIndex - 1];
  if (!parentId) return [];
  return listMasterEntityGroupChildrenForParent(allGroups, parentId, excludeGroupId);
}
