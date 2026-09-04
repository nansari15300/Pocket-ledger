import { IC_COMPANY_PARTY_GROUP_ID } from "@/lib/interCompany/icPeerCompanyGroups";
import { PARTY_ENTITY_GROUP_PRESET } from "@/lib/masterEntityGroupFormPresets";
import type { MasterGroupListRow, MasterGroupTreeNode } from "@/lib/masterGroupListTree";
import {
  buildMasterGroupTreeBranches,
  filterMasterGroupsForFormPage,
  mergeMasterGroupRowsForCombobox,
  MASTER_GROUP_TREE_COMBOBOX_LIST_CLASS,
  MASTER_GROUP_TREE_COMBOBOX_POPOVER_CLASS,
  resolveMasterGroupTreeBreadcrumbLabel,
  resolveMasterGroupTreeBranchIdForGroup,
} from "@/lib/masterGroupTreeCombobox";
import {
  isPartySystemGroupId,
  normalizePartyGroupIdForForm,
  PARTY_SYSTEM_GROUP_OPTIONS,
} from "@/lib/partySystemGroups";
import { isSystemParentGroup } from "@/lib/system-groups";

/** Party add/edit — tall PC list; mobile par near full-screen picker. */
export const PARTY_GROUP_COMBOBOX_POPOVER_CLASS = MASTER_GROUP_TREE_COMBOBOX_POPOVER_CLASS;

export const PARTY_GROUP_COMBOBOX_LIST_CLASS = MASTER_GROUP_TREE_COMBOBOX_LIST_CLASS;

export type PartyGroupComboboxOption = {
  value: string;
  label: string;
  triggerLabel?: string;
  depth?: number;
  disabled?: boolean;
  searchText?: string;
};

export type PartyGroupComboboxRow = MasterGroupListRow & {
  isReportOnly?: boolean;
  isAutoUngrouped?: boolean;
  isDeleted?: boolean;
};

function partyGroupsForComboboxForest(groups: PartyGroupComboboxRow[]): PartyGroupComboboxRow[] {
  return groups.filter(
    (g) =>
      g?.id &&
      !g.isDeleted &&
      g.isReportOnly !== true &&
      g.isAutoUngrouped !== true &&
      g.id !== IC_COMPANY_PARTY_GROUP_ID &&
      !isSystemParentGroup("groups", g.id)
  );
}

/** Party add/edit — Sundry Debtors / Sundry Creditors selectable + nested user groups. */
export function buildPartyGroupAccountComboboxOptions(
  groups: PartyGroupComboboxRow[],
  branchIndexGroups?: PartyGroupComboboxRow[]
): PartyGroupComboboxOption[] {
  const alive = partyGroupsForComboboxForest(groups);
  const treeBranches = buildMasterGroupTreeBranches(
    alive,
    PARTY_ENTITY_GROUP_PRESET,
    branchIndexGroups && branchIndexGroups.length > 0 ? branchIndexGroups : groups
  );

  const out: PartyGroupComboboxOption[] = [];

  for (const branch of treeBranches) {
    out.push({
      value: branch.branchId,
      label: branch.branchName,
      triggerLabel: branch.branchName,
      depth: 0,
      searchText: branch.branchName.toLowerCase(),
    });

    const walk = (list: MasterGroupTreeNode[]) => {
      for (const n of list) {
        const triggerLabel = resolvePartyGroupBreadcrumbLabel(n.group.id, alive);
        out.push({
          value: n.group.id,
          label: triggerLabel,
          triggerLabel,
          depth: n.depth + 1,
          searchText: triggerLabel.toLowerCase(),
        });
        walk(n.children);
      }
    };
    walk(branch.nodes);
  }

  return out;
}

export const buildPartyGroupComboboxOptions = buildPartyGroupAccountComboboxOptions;

export type PartyGroupTreeBranch = {
  branchId: string;
  branchName: string;
  nodes: MasterGroupTreeNode[];
};

/** Party form tree picker — Sundry Debtors / Creditors branches + nested user groups. */
export function buildPartyGroupTreeBranches(
  groups: PartyGroupComboboxRow[],
  branchIndexGroups?: PartyGroupComboboxRow[]
): PartyGroupTreeBranch[] {
  return buildMasterGroupTreeBranches(groups, PARTY_ENTITY_GROUP_PRESET, branchIndexGroups);
}

export function collectPartyGroupAncestorIds(
  groupId: string | null | undefined,
  groups: Array<{ id: string; parentId?: string }>
): string[] {
  const gid = String(groupId || "").trim();
  if (!gid || isPartySystemGroupId(gid)) return [];
  const byId = new Map(groups.filter((g) => g?.id).map((g) => [g.id, g]));
  const out: string[] = [];
  let pid = String(byId.get(gid)?.parentId || "").trim();
  while (pid && !isPartySystemGroupId(pid) && !isSystemParentGroup("groups", pid)) {
    if (byId.has(pid)) out.unshift(pid);
    pid = String(byId.get(pid)?.parentId || "").trim();
  }
  return out;
}

export function resolvePartyGroupBranchIdForGroup(
  groupId: string | null | undefined,
  groups: PartyGroupComboboxRow[]
): string | null {
  return resolveMasterGroupTreeBranchIdForGroup(groupId, groups, PARTY_ENTITY_GROUP_PRESET);
}

/** Selected trigger — e.g. Sundry Creditors / Suppliers */
export function resolvePartyGroupBreadcrumbLabel(
  groupId: string | null | undefined,
  groups: Array<{ id: string; name: string; parentId?: string }>,
  fallback = "Sundry Creditors"
): string {
  return resolveMasterGroupTreeBreadcrumbLabel(groupId, groups, PARTY_ENTITY_GROUP_PRESET, fallback);
}

export function filterPartyGroupsLikePartyPage(
  groups: PartyGroupComboboxRow[]
): PartyGroupComboboxRow[] {
  return filterMasterGroupsForFormPage(groups, PARTY_ENTITY_GROUP_PRESET);
}

export const mergePartyGroupRowsForCombobox = mergeMasterGroupRowsForCombobox;

// Re-export for callers that still reference party system options in tree context.
export { PARTY_SYSTEM_GROUP_OPTIONS };
