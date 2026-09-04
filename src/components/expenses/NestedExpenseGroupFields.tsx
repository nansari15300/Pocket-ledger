"use client";

import type { ReactNode } from "react";
import type { ExpenseGroup } from "./types";
import type { ExpenseGroupCreateChainSlot, ExpenseGroupListBranch } from "@/lib/expenseGroupTree";
import { ExpenseGroupNestedParentFields } from "./ExpenseGroupNestedParentFields";

type NestedExpenseGroupFieldsProps = {
  allGroups?: ExpenseGroup[];
  excludeGroupId?: string;
  systemBranch: ExpenseGroupListBranch;
  onSystemBranchChange: (branch: ExpenseGroupListBranch) => void;
  parentPathIds: string[];
  onParentPathIdsChange: (ids: string[]) => void;
  childPathIds?: string[];
  onChildPathIdsChange?: (ids: string[]) => void;
  chainSlots?: ExpenseGroupCreateChainSlot[];
  onChainSlotsChange?: (slots: ExpenseGroupCreateChainSlot[]) => void;
  onAddNewParentAtLevel?: (levelIndex: number, name: string) => void;
  groupName: string;
  onGroupNameChange: (name: string) => void;
  mode?: "create" | "edit";
  editingGroup?: ExpenseGroup | null;
  disabled?: boolean;
  formResetKey?: string;
  editLevel0Trailing?: ReactNode;
};

export function NestedExpenseGroupFields({
  allGroups = [],
  excludeGroupId,
  systemBranch,
  onSystemBranchChange,
  parentPathIds,
  onParentPathIdsChange,
  childPathIds,
  onChildPathIdsChange,
  chainSlots,
  onChainSlotsChange,
  onAddNewParentAtLevel,
  groupName,
  onGroupNameChange,
  mode = "create",
  editingGroup = null,
  disabled = false,
  formResetKey,
  editLevel0Trailing,
}: NestedExpenseGroupFieldsProps) {
  return (
    <ExpenseGroupNestedParentFields
      allGroups={allGroups}
      excludeGroupId={excludeGroupId}
      systemBranch={systemBranch}
      onSystemBranchChange={onSystemBranchChange}
      parentPathIds={parentPathIds}
      onParentPathIdsChange={onParentPathIdsChange}
      childPathIds={childPathIds}
      onChildPathIdsChange={onChildPathIdsChange}
      chainSlots={chainSlots}
      onChainSlotsChange={onChainSlotsChange}
      onAddNewAtLevel={onAddNewParentAtLevel}
      groupName={groupName}
      onGroupNameChange={onGroupNameChange}
      mode={mode}
      editingGroup={editingGroup}
      disabled={disabled}
      formResetKey={formResetKey}
      editLevel0Trailing={editLevel0Trailing}
    />
  );
}
