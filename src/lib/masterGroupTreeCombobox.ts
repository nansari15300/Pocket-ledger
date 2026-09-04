import { IC_COMPANY_PARTY_GROUP_ID } from "@/lib/interCompany/icPeerCompanyGroups";
import type { MasterEntityGroupFormPreset } from "@/lib/masterEntityGroupFormPresets";
import { defaultMasterGroupBreadcrumbLabel } from "@/lib/masterGroupAccountCombobox";
import {
  buildMasterGroupListForest,
  resolveMasterGroupBranchForGroup,
  splitMasterGroupForestByBranch,
  type MasterGroupListRow,
  type MasterGroupTreeNode,
} from "@/lib/masterGroupListTree";
import {
  isPartySystemGroupId,
  normalizePartyGroupIdForForm,
} from "@/lib/partySystemGroups";
import { isSystemParentGroup } from "@/lib/system-groups";

/** Master add/edit — tall PC list; mobile par near full-screen picker. */
export const MASTER_GROUP_TREE_COMBOBOX_POPOVER_CLASS =
  "flex max-h-[min(92dvh,720px)] flex-col overflow-hidden max-md:fixed max-md:inset-x-2 max-md:top-[max(0.5rem,env(safe-area-inset-top))] max-md:bottom-[max(0.5rem,env(safe-area-inset-bottom))] max-md:z-[10000] max-md:max-h-none max-md:w-auto max-md:max-w-none md:min-w-[var(--radix-popover-trigger-width)]";

export const MASTER_GROUP_TREE_COMBOBOX_LIST_CLASS =
  "min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y [-webkit-overflow-scrolling:touch]";

export type MasterGroupTreeComboboxRow = MasterGroupListRow & {
  isReportOnly?: boolean;
  isAutoUngrouped?: boolean;
  isDeleted?: boolean;
  isSystemReserved?: boolean;
};

export type MasterGroupTreeBranch = {
  branchId: string;
  branchName: string;
  nodes: MasterGroupTreeNode[];
};

function presetExtraExcludeIds(
  preset: MasterEntityGroupFormPreset,
  extraExcludeIds?: string[]
): Set<string> {
  const extra = new Set(extraExcludeIds ?? []);
  if (preset.systemGroupKind === "party") {
    extra.add(IC_COMPANY_PARTY_GROUP_ID);
  }
  return extra;
}

function forestFilterRow(
  g: MasterGroupTreeComboboxRow,
  preset: MasterEntityGroupFormPreset,
  extraExcludeIds: Set<string>
): boolean {
  if (!g?.id || g.isDeleted) return false;
  if (g.isReportOnly === true) return false;
  if (g.isAutoUngrouped === true) return false;
  if (extraExcludeIds.has(g.id)) return false;
  switch (preset.systemGroupKind) {
    case "party":
      return !isSystemParentGroup("groups", g.id);
    case "bank":
    case "staff":
      return !g.isSystemReserved;
    case "tax":
      return !g.isSystemReserved && !isSystemParentGroup("tax_groups", g.id);
    case "item":
      return !isSystemParentGroup("item_groups", g.id);
    case "expense":
      return true;
    default:
      return true;
  }
}

export function filterMasterGroupsForFormPage(
  groups: MasterGroupTreeComboboxRow[],
  preset: MasterEntityGroupFormPreset,
  opts?: { extraExcludeIds?: string[] }
): MasterGroupTreeComboboxRow[] {
  const extra = presetExtraExcludeIds(preset, opts?.extraExcludeIds);
  return groups.filter((g) => {
    if (!g?.id || g.isDeleted) return false;
    if (g.isReportOnly === true) return false;
    if (g.isAutoUngrouped === true) return false;
    if (extra.has(g.id)) return false;
    if (preset.systemGroupKind === "party" && isSystemParentGroup("groups", g.id)) return false;
    return true;
  });
}

export function mergeMasterGroupRowsForCombobox(
  groups: MasterGroupTreeComboboxRow[],
  processedGroups: MasterGroupTreeComboboxRow[] = []
): MasterGroupTreeComboboxRow[] {
  const liveById = new Map<string, MasterGroupTreeComboboxRow>();
  for (const g of groups) {
    if (!g?.id || g.isDeleted === true) continue;
    liveById.set(g.id, g);
  }

  const processedById = new Map<string, MasterGroupTreeComboboxRow>();
  for (const g of processedGroups) {
    if (!g?.id || g.isDeleted === true) continue;
    processedById.set(g.id, g);
  }

  const liveGroupsReady = liveById.size > 0;
  const merged: MasterGroupTreeComboboxRow[] = [];

  for (const [id, live] of liveById) {
    const processed = processedById.get(id);
    merged.push({
      ...(processed ?? {}),
      ...live,
      id,
      parentId: processed?.parentId ?? live.parentId,
      isDeleted: false,
    });
  }

  if (!liveGroupsReady) {
    for (const [id, processed] of processedById) {
      if (liveById.has(id)) continue;
      merged.push({ ...processed, isDeleted: false });
    }
  }

  return merged;
}

export function buildMasterGroupTreeBranches(
  groups: MasterGroupTreeComboboxRow[],
  preset: MasterEntityGroupFormPreset,
  branchIndexGroups?: MasterGroupTreeComboboxRow[],
  opts?: { extraExcludeIds?: string[] }
): MasterGroupTreeBranch[] {
  const extra = presetExtraExcludeIds(preset, opts?.extraExcludeIds);
  const alive = groups.filter((g) => forestFilterRow(g, preset, extra));
  const forest = buildMasterGroupListForest(alive, preset.config);
  const index = branchIndexGroups && branchIndexGroups.length > 0 ? branchIndexGroups : groups;
  const byBranch = splitMasterGroupForestByBranch(forest, preset.config, index);
  return preset.topParentOptions.map((branch) => ({
    branchId: branch.id,
    branchName: branch.name,
    nodes: byBranch[branch.id] ?? [],
  }));
}

export function resolveMasterGroupTreeBreadcrumbLabel(
  groupId: string | null | undefined,
  groups: Array<{ id: string; name: string; parentId?: string }>,
  preset: MasterEntityGroupFormPreset,
  fallback?: string
): string {
  const fb =
    fallback ??
    preset.topParentOptions[0]?.name ??
    "Ungrouped";

  if (preset.systemGroupKind === "party") {
    const gid = normalizePartyGroupIdForForm(groupId);
    if (isPartySystemGroupId(gid)) {
      return preset.topParentOptions.find((b) => b.id === gid)?.name ?? fb;
    }
  }

  const gid = String(groupId || "").trim();
  if (!gid) return fb;

  return defaultMasterGroupBreadcrumbLabel(
    gid,
    groups as MasterGroupTreeComboboxRow[],
    preset.config,
    preset.topParentOptions,
    fb
  );
}

export function resolveMasterGroupTreeBranchIdForGroup(
  groupId: string | null | undefined,
  groups: MasterGroupTreeComboboxRow[],
  preset: MasterEntityGroupFormPreset
): string | null {
  if (preset.systemGroupKind === "party") {
    const gid = normalizePartyGroupIdForForm(groupId);
    if (isPartySystemGroupId(gid)) return gid;
  }

  const gid = String(groupId || "").trim();
  if (!gid) return null;

  const group = groups.find((g) => g.id === gid);
  if (!group) return null;
  return resolveMasterGroupBranchForGroup(group, groups, preset.config);
}
