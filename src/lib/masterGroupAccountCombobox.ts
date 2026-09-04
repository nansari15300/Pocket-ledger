import type { MasterGroupListConfig, MasterGroupListRow, MasterGroupTreeNode } from "@/lib/masterGroupListTree";
import {
  buildMasterGroupListForest,
  resolveMasterGroupBranchId,
  splitMasterGroupForestByBranch,
} from "@/lib/masterGroupListTree";

export type MasterGroupAccountComboboxOption = {
  value: string;
  label: string;
  triggerLabel?: string;
  depth?: number;
  disabled?: boolean;
  searchText?: string;
};

const MASTER_GROUP_BRANCH_HEADER_PREFIX = "__master_branch_hdr__:";

export function buildMasterGroupAccountComboboxOptions<G extends MasterGroupListRow>(
  groups: G[],
  config: MasterGroupListConfig,
  topParentOptions: Array<{ id: string; name: string }>,
  opts?: {
    ungroupedOption?: { value: string; label: string };
    filterRow?: (g: G) => boolean;
    legacyParentIdsByBranch?: Record<string, string[]>;
    resolveBreadcrumbLabel?: (groupId: string, groups: G[]) => string;
    /** Party-style: system branches selectable at depth 0 (not disabled headers). */
    branchSelectable?: boolean;
  }
): MasterGroupAccountComboboxOption[] {
  const filterRow = opts?.filterRow ?? (() => true);
  const alive = groups.filter((g) => g?.id && filterRow(g));
  const forest = buildMasterGroupListForest(alive, config);
  const byBranch = splitMasterGroupForestByBranch(forest, config, alive);
  const resolveLabel =
    opts?.resolveBreadcrumbLabel ??
    ((groupId: string, rows: G[]) => defaultMasterGroupBreadcrumbLabel(groupId, rows, config, topParentOptions));

  const out: MasterGroupAccountComboboxOption[] = [];

  if (opts?.ungroupedOption) {
    out.push({
      value: opts.ungroupedOption.value,
      label: opts.ungroupedOption.label,
      triggerLabel: opts.ungroupedOption.label,
      depth: 0,
    });
  }

  const branchSelectable = opts?.branchSelectable === true;

  for (const branch of topParentOptions) {
    const branchForest = byBranch[branch.id] ?? [];
    if (!branchSelectable && branchForest.length === 0) continue;

    out.push({
      value: branchSelectable ? branch.id : `${MASTER_GROUP_BRANCH_HEADER_PREFIX}${branch.id}`,
      label: branch.name,
      triggerLabel: branch.name,
      depth: 0,
      disabled: !branchSelectable,
      searchText: branch.name.toLowerCase(),
    });

    const walk = (list: MasterGroupTreeNode<G>[]) => {
      for (const n of list) {
        const triggerLabel = resolveLabel(n.group.id, alive);
        out.push({
          value: n.group.id,
          label: n.group.name,
          triggerLabel,
          depth: n.depth + 1,
          searchText: triggerLabel.toLowerCase(),
        });
        walk(n.children);
      }
    };
    walk(branchForest);
  }

  return out;
}

export function defaultMasterGroupBreadcrumbLabel<G extends MasterGroupListRow>(
  groupId: string | null | undefined,
  groups: G[],
  config: MasterGroupListConfig,
  topParentOptions: Array<{ id: string; name: string }>,
  fallback = "Ungrouped"
): string {
  const gid = String(groupId || "").trim();
  if (!gid) return fallback;

  const branchDef = topParentOptions.find((b) => b.id === gid);
  if (branchDef) return branchDef.name;

  const byId = new Map(groups.filter((g) => g?.id).map((g) => [g.id, g]));
  const group = byId.get(gid);
  if (!group) return gid;

  const names: string[] = [String(group.name || "").trim() || gid];
  const virtualRoots = config.virtualRootIds ?? new Set<string>();
  const branchIds = new Set(config.branches.map((b) => b.id));
  let pid = String(group.parentId || "").trim();

  while (pid && !virtualRoots.has(pid) && !branchIds.has(pid)) {
    const parent = byId.get(pid);
    if (!parent) break;
    names.unshift(String(parent.name || "").trim() || pid);
    pid = String(parent.parentId || "").trim();
  }

  const branchId = resolveMasterGroupBranchId(group.parentId, groups, config);
  const branchName = topParentOptions.find((b) => b.id === branchId)?.name ?? fallback;
  if (names[0] !== branchName) names.unshift(branchName);
  return names.join(" / ");
}
