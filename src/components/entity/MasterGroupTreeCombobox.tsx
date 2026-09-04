"use client";

import * as React from "react";
import { Check, ChevronsUpDown, ChevronDown, ChevronRight, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { highlightQueryInText } from "@/lib/highlightQueryInText";
import { masterEntityTextMatchesSearch } from "@/lib/filterMasterEntityListRows";
import type { MasterGroupTreeNode } from "@/lib/masterGroupListTree";
import type { MasterEntityGroupFormPreset } from "@/lib/masterEntityGroupFormPresets";
import {
  buildMasterGroupTreeBranches,
  filterMasterGroupsForFormPage,
  mergeMasterGroupRowsForCombobox,
  MASTER_GROUP_TREE_COMBOBOX_LIST_CLASS,
  MASTER_GROUP_TREE_COMBOBOX_POPOVER_CLASS,
  resolveMasterGroupTreeBreadcrumbLabel,
  resolveMasterGroupTreeBranchIdForGroup,
  type MasterGroupTreeComboboxRow,
} from "@/lib/masterGroupTreeCombobox";

const TREE_INDENT_PX = 15;
const PLACEMENT_HINT = "Account placed here";
const TREE_GUIDE = "border-muted-foreground/25";
const TREE_ROW_MID_Y = 14;
const TREE_ROW_PL = 12;
const TREE_CHEVRON_SLOT = 18;
const TREE_CHECK_SLOT = 22;
const GROUP_NAME_OFFSET = TREE_ROW_PL + TREE_CHEVRON_SLOT + TREE_CHECK_SLOT;
const H_LINE_GAP_BEFORE_TEXT = 2;
const PLACEMENT_HINT_AFTER_NAME = 10;

function TreeGuideRow({
  isLast,
  children,
  lineTargetPx = GROUP_NAME_OFFSET,
  contentPaddingLeft = TREE_ROW_PL,
}: {
  isLast: boolean;
  children: React.ReactNode;
  lineTargetPx?: number;
  contentPaddingLeft?: number;
}) {
  const connectorEnd = Math.max(0, lineTargetPx - H_LINE_GAP_BEFORE_TEXT);

  return (
    <div className="relative">
      <span aria-hidden className={cn("absolute left-0 top-0 border-l", TREE_GUIDE)} style={{ height: TREE_ROW_MID_Y }} />
      <div
        aria-hidden
        className="absolute flex items-center"
        style={{ left: 0, top: TREE_ROW_MID_Y, width: connectorEnd, transform: "translateY(-50%)" }}
      >
        <span className={cn("min-w-0 flex-1 border-t", TREE_GUIDE)} />
        <span className="shrink-0 text-[10px] leading-none text-muted-foreground/35">&gt;</span>
      </div>
      {!isLast ? (
        <span
          aria-hidden
          className={cn("absolute left-0 bottom-0 border-l", TREE_GUIDE)}
          style={{ top: TREE_ROW_MID_Y }}
        />
      ) : null}
      <div style={{ paddingLeft: contentPaddingLeft }}>{children}</div>
    </div>
  );
}

function TreeGuideList({
  marginLeft = 8,
  children,
}: {
  marginLeft?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-w-0" style={{ marginLeft }}>
      {children}
    </div>
  );
}

export type MasterGroupTreeComboboxProps = {
  preset: MasterEntityGroupFormPreset;
  groups: MasterGroupTreeComboboxRow[];
  processedGroups?: MasterGroupTreeComboboxRow[];
  value?: string;
  onChange?: (value: string, newName?: string) => void;
  /** Group pick par system branch auto-update (party account type, bank cash/bank, etc.). */
  onBranchChange?: (branchId: string) => void;
  extraExcludeIds?: string[];
  placeholder?: string;
  searchPlaceholder?: string;
  addNewLabel?: string;
  disabled?: boolean;
  popoverModal?: boolean;
  /** Done dabane tak dropdown band na ho; row click = preview + hint move. */
  confirmWithOk?: boolean;
};

function nodeSelfMatchesSearch(
  node: MasterGroupTreeNode,
  branchName: string,
  search: string,
  groups: MasterGroupTreeComboboxRow[],
  preset: MasterEntityGroupFormPreset
): boolean {
  if (!search.trim()) return true;
  const breadcrumb = resolveMasterGroupTreeBreadcrumbLabel(node.group.id, groups, preset);
  return (
    masterEntityTextMatchesSearch(node.group.name, search) ||
    masterEntityTextMatchesSearch(branchName, search) ||
    masterEntityTextMatchesSearch(breadcrumb, search)
  );
}

function filterTreeNodesForSearch(
  nodes: MasterGroupTreeNode[],
  branchName: string,
  search: string,
  groups: MasterGroupTreeComboboxRow[],
  preset: MasterEntityGroupFormPreset
): MasterGroupTreeNode[] {
  if (!search.trim()) return nodes;
  const walk = (list: MasterGroupTreeNode[]): MasterGroupTreeNode[] => {
    const out: MasterGroupTreeNode[] = [];
    for (const node of list) {
      const childMatches = walk(node.children);
      const selfMatch = nodeSelfMatchesSearch(node, branchName, search, groups, preset);
      if (selfMatch) {
        out.push({ ...node, children: [] });
      } else if (childMatches.length > 0) {
        out.push({ ...node, children: childMatches });
      }
    }
    return out;
  };
  return walk(nodes);
}

function branchVisibleInSearch(
  branchName: string,
  nodes: MasterGroupTreeNode[],
  search: string,
  groups: MasterGroupTreeComboboxRow[],
  preset: MasterEntityGroupFormPreset
): boolean {
  if (!search.trim()) return true;
  if (masterEntityTextMatchesSearch(branchName, search)) return true;
  return filterTreeNodesForSearch(nodes, branchName, search, groups, preset).length > 0;
}

export function MasterGroupTreeCombobox({
  preset,
  groups,
  processedGroups = [],
  value = "",
  onChange,
  onBranchChange,
  extraExcludeIds,
  placeholder = "Select a group",
  searchPlaceholder = "Search groups...",
  addNewLabel = "Add New Group",
  disabled = false,
  popoverModal = false,
  confirmWithOk = false,
}: MasterGroupTreeComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [draftValue, setDraftValue] = React.useState(value);
  const [expandedBranchIds, setExpandedBranchIds] = React.useState<Set<string>>(() => new Set());
  const [expandedGroupIds, setExpandedGroupIds] = React.useState<Set<string>>(() => new Set());
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  const branchSelectable = preset.branchSelectable === true;

  const mergedGroups = React.useMemo(
    () => mergeMasterGroupRowsForCombobox(groups, processedGroups),
    [groups, processedGroups]
  );

  const displayGroups = React.useMemo(
    () => filterMasterGroupsForFormPage(mergedGroups, preset, { extraExcludeIds }),
    [mergedGroups, preset, extraExcludeIds]
  );

  const treeBranches = React.useMemo(
    () => buildMasterGroupTreeBranches(displayGroups, preset, mergedGroups, { extraExcludeIds }),
    [displayGroups, preset, mergedGroups, extraExcludeIds]
  );

  const activeValue = confirmWithOk && open ? draftValue : value;
  const placementHintGroupId = String(activeValue || "").trim();

  const selectedLabel = React.useMemo(
    () => resolveMasterGroupTreeBreadcrumbLabel(value, mergedGroups, preset, placeholder),
    [value, mergedGroups, preset, placeholder]
  );

  const searchActive = Boolean(search.trim());

  const expandAllTreeNodes = React.useCallback(() => {
    setExpandedBranchIds(new Set(treeBranches.map((b) => b.branchId)));
    const allGroupIds = new Set<string>();
    const walk = (nodes: MasterGroupTreeNode[]) => {
      for (const node of nodes) {
        if (node.children.length > 0) allGroupIds.add(node.group.id);
        walk(node.children);
      }
    };
    for (const branch of treeBranches) {
      walk(branch.nodes);
    }
    setExpandedGroupIds(allGroupIds);
  }, [treeBranches]);

  React.useEffect(() => {
    if (!open) return;
    setDraftValue(value);
    expandAllTreeNodes();
    const id = requestAnimationFrame(() => searchInputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open, value, expandAllTreeNodes]);

  React.useEffect(() => {
    if (!open || searchActive) return;
    expandAllTreeNodes();
  }, [open, searchActive, expandAllTreeNodes]);

  React.useEffect(() => {
    if (!open || !searchActive) return;
    const nextBranches = new Set<string>();
    const nextGroups = new Set<string>();
    for (const branch of treeBranches) {
      if (!branchVisibleInSearch(branch.branchName, branch.nodes, search, mergedGroups, preset)) continue;
      nextBranches.add(branch.branchId);
      const branchNameMatches = masterEntityTextMatchesSearch(branch.branchName, search);
      if (branchNameMatches) continue;
      const walk = (nodes: MasterGroupTreeNode[]) => {
        for (const node of nodes) {
          if (node.children.length > 0) nextGroups.add(node.group.id);
          walk(node.children);
        }
      };
      walk(filterTreeNodesForSearch(branch.nodes, branch.branchName, search, mergedGroups, preset));
    }
    setExpandedBranchIds(nextBranches);
    setExpandedGroupIds(nextGroups);
  }, [open, searchActive, search, treeBranches, mergedGroups, preset]);

  const syncBranchForGroup = (groupId: string) => {
    const branchId = resolveMasterGroupTreeBranchIdForGroup(groupId, mergedGroups, preset);
    if (branchId) onBranchChange?.(branchId);
  };

  const pickValue = (nextValue: string) => {
    if (confirmWithOk) {
      setDraftValue(nextValue);
      syncBranchForGroup(nextValue);
      return;
    }
    syncBranchForGroup(nextValue);
    onChange?.(nextValue);
    setOpen(false);
    setSearch("");
  };

  const confirmSelection = () => {
    if (!draftValue) return;
    syncBranchForGroup(draftValue);
    onChange?.(draftValue);
    setOpen(false);
    setSearch("");
  };

  const toggleBranch = (branchId: string) => {
    setExpandedBranchIds((prev) => {
      const next = new Set(prev);
      if (next.has(branchId)) next.delete(branchId);
      else next.add(branchId);
      return next;
    });
  };

  const toggleGroup = (groupId: string) => {
    setExpandedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const renderPlacementHint = (inGroupRowContent = false) => {
    const hintTextOffset = inGroupRowContent
      ? TREE_CHEVRON_SLOT + TREE_CHECK_SLOT + PLACEMENT_HINT_AFTER_NAME
      : GROUP_NAME_OFFSET + PLACEMENT_HINT_AFTER_NAME;

    return (
      <TreeGuideList marginLeft={0}>
        <TreeGuideRow isLast lineTargetPx={hintTextOffset} contentPaddingLeft={hintTextOffset}>
          <div className="select-none py-0.5 pr-2 text-[11px] italic leading-snug text-muted-foreground/65">
            {PLACEMENT_HINT}
          </div>
        </TreeGuideRow>
      </TreeGuideList>
    );
  };

  const renderPickRow = (
    rowId: string,
    label: string,
    hasChildren: boolean,
    isExpanded: boolean,
    onToggle: () => void,
    isSelected: boolean,
    isPlacementHere: boolean,
    onPick: () => void,
    fontMedium = false,
    childrenNodes?: React.ReactNode
  ) => (
    <>
      <div
        role="option"
        aria-selected={isSelected}
        className={cn(
          "flex min-w-0 cursor-pointer select-none items-center rounded-sm py-1.5 pr-2 text-sm hover:bg-muted/50",
          fontMedium && "font-medium",
          isSelected && "bg-emerald-50 ring-1 ring-emerald-500/40 dark:bg-emerald-950/30"
        )}
        onClick={onPick}
      >
        {hasChildren ? (
          <button
            type="button"
            aria-label={isExpanded ? "Collapse" : "Expand"}
            className="mr-0.5 shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggle();
            }}
          >
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>
        ) : (
          <span className="mr-0.5 inline-flex w-4 shrink-0" aria-hidden />
        )}
        <Check className={cn("mr-1.5 h-4 w-4 shrink-0", isSelected ? "opacity-100 text-emerald-600" : "opacity-0")} />
        <span className="min-w-0 flex-1 truncate text-left">
          {searchActive ? highlightQueryInText(label, search) : label}
        </span>
      </div>
      {isPlacementHere ? renderPlacementHint(!fontMedium) : null}
      {childrenNodes}
    </>
  );

  const renderTreeNodeRow = (
    node: MasterGroupTreeNode,
    branchName: string,
    depth: number
  ) => {
    const hasChildren = node.children.length > 0;
    const isExpanded = searchActive || expandedGroupIds.has(node.group.id);
    const isSelected = activeValue === node.group.id;
    const isPlacementHere = placementHintGroupId === node.group.id;

    return renderPickRow(
      node.group.id,
      node.group.name,
      hasChildren,
      isExpanded,
      () => toggleGroup(node.group.id),
      isSelected,
      isPlacementHere,
      () => pickValue(node.group.id),
      false,
      hasChildren && isExpanded ? (
        <TreeGuideList marginLeft={TREE_INDENT_PX}>
          {renderTreeNodeList(node.children, branchName, depth + 1)}
        </TreeGuideList>
      ) : null
    );
  };

  const renderTreeNodeList = (
    nodes: MasterGroupTreeNode[],
    branchName: string,
    depth: number
  ): React.ReactNode =>
    nodes.map((node, index) => (
      <TreeGuideRow key={node.group.id} isLast={index === nodes.length - 1}>
        {renderTreeNodeRow(node, branchName, depth)}
      </TreeGuideRow>
    ));

  const renderBranch = (branch: (typeof treeBranches)[number]) => {
    const branchNameMatches = searchActive && masterEntityTextMatchesSearch(branch.branchName, search);
    const visibleNodes = searchActive
      ? branchNameMatches
        ? []
        : filterTreeNodesForSearch(branch.nodes, branch.branchName, search, mergedGroups, preset)
      : branch.nodes;

    if (searchActive && !branchVisibleInSearch(branch.branchName, branch.nodes, search, mergedGroups, preset)) {
      return null;
    }

    const hasChildren = visibleNodes.length > 0;
    const branchExpanded = searchActive || expandedBranchIds.has(branch.branchId);
    const branchSelected = branchSelectable && activeValue === branch.branchId;
    const isPlacementHere = branchSelectable && placementHintGroupId === branch.branchId;

    return (
      <div key={branch.branchId} className="min-w-0">
        {renderPickRow(
          branch.branchId,
          branch.branchName,
          hasChildren,
          branchExpanded,
          () => toggleBranch(branch.branchId),
          branchSelected,
          isPlacementHere,
          () => {
            if (branchSelectable) pickValue(branch.branchId);
          },
          true,
          hasChildren && branchExpanded ? (
            <TreeGuideList marginLeft={8}>
              {visibleNodes.map((node, index) => (
                <TreeGuideRow key={node.group.id} isLast={index === visibleNodes.length - 1}>
                  {renderTreeNodeRow(node, branch.branchName, 0)}
                </TreeGuideRow>
              ))}
            </TreeGuideList>
          ) : null
        )}
      </div>
    );
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSearch("");
      }}
      modal={popoverModal}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="h-9 w-full max-w-full justify-between gap-0.5 px-2"
        >
          <span className="block min-w-0 flex-1 truncate text-left">{selectedLabel || placeholder}</span>
          <ChevronsUpDown className="mr-0.5 h-4 w-4 shrink-0 opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={cn("z-[9999] p-0", MASTER_GROUP_TREE_COMBOBOX_POPOVER_CLASS)}
        sideOffset={4}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onWheel={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center border-b px-3">
          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
          <input
            ref={searchInputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="flex h-11 w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div
          className={cn("p-1", MASTER_GROUP_TREE_COMBOBOX_LIST_CLASS)}
          onWheel={(e) => e.stopPropagation()}
        >
          {treeBranches.map((branch) => renderBranch(branch))}
        </div>
        {addNewLabel || confirmWithOk ? (
          <div className="flex shrink-0 items-center gap-2 border-t p-1.5">
            {addNewLabel ? (
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center rounded-sm px-2 py-2 text-sm font-medium text-green-600 hover:bg-green-50 dark:hover:bg-green-950/30"
                onClick={() => {
                  onChange?.("add-new", search.trim());
                  setOpen(false);
                  setSearch("");
                }}
              >
                {search.trim() ? `${addNewLabel}: "${search.trim()}"` : addNewLabel}
              </button>
            ) : (
              <span className="flex-1" />
            )}
            {confirmWithOk ? (
              <Button
                type="button"
                className="h-9 shrink-0 px-5"
                onClick={confirmSelection}
                disabled={!draftValue}
              >
                Done
              </Button>
            ) : null}
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
