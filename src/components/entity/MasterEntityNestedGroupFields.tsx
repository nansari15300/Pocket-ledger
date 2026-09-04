"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import type { MasterGroupListConfig, MasterGroupListRow } from "@/lib/masterGroupListTree";
import {
  MASTER_ENTITY_GROUP_STEPPED_DIRECT,
  isMasterEntityGroupCreateChainSlotEmpty,
  listMasterEntityGroupChildrenForParent,
  listMasterEntityGroupLevelOptions,
  masterEntityGroupPendingSlotValue,
  parseMasterEntityGroupPendingSlotValue,
  type MasterEntityGroupCreateChainSlot,
} from "@/lib/masterEntityGroupTreeForm";

export const MASTER_ENTITY_NESTED_FORM_INDENT_PX = 15;

type MasterEntityNestedGroupFieldsProps<G extends MasterGroupListRow = MasterGroupListRow> = {
  allGroups: G[];
  config: MasterGroupListConfig;
  topParentOptions: Array<{ id: string; name: string }>;
  systemBranch: string;
  onSystemBranchChange: (branch: string) => void;
  parentPathIds: string[];
  onParentPathIdsChange: (ids: string[]) => void;
  childPathIds?: string[];
  onChildPathIdsChange?: (ids: string[]) => void;
  chainSlots?: MasterEntityGroupCreateChainSlot[];
  onChainSlotsChange?: (slots: MasterEntityGroupCreateChainSlot[]) => void;
  onAddNewAtLevel?: (levelIndex: number, name: string) => void;
  groupName: string;
  onGroupNameChange: (name: string) => void;
  mode?: "create" | "edit";
  editingGroup?: G | null;
  disabled?: boolean;
  formResetKey?: string;
  excludeGroupId?: string;
  legacyParentIds?: string[];
  /** Edit mode — Users Parent group (current name) row ke right side. */
  editLevel0Trailing?: ReactNode;
};

function nestedLevelLabel(levelIndex: number): string {
  if (levelIndex === 0) return "Users Parent group";
  if (levelIndex === 1) return "Child group";
  return "Sub child Group";
}

function getCreateSlot(
  slots: MasterEntityGroupCreateChainSlot[],
  index: number
): MasterEntityGroupCreateChainSlot {
  return slots[index] || {};
}

function resolveCreateParentForLevel(
  systemBranch: string,
  slots: MasterEntityGroupCreateChainSlot[],
  levelIndex: number
): string {
  if (levelIndex === 0) return systemBranch;
  for (let i = levelIndex - 1; i >= 0; i--) {
    const id = slots[i]?.groupId;
    if (id) return id;
  }
  return systemBranch;
}

function slotToComboboxValue(
  slot: MasterEntityGroupCreateChainSlot,
  levelIndex: number
): string {
  if (slot.groupId) return slot.groupId;
  const pending = String(slot.pendingName || "").trim();
  if (pending) return masterEntityGroupPendingSlotValue(pending);
  return "";
}

function pushPendingDownOnExistingSelect(
  slots: MasterEntityGroupCreateChainSlot[],
  levelIndex: number,
  selectedGroupId: string
): MasterEntityGroupCreateChainSlot[] {
  const current = getCreateSlot(slots, levelIndex);
  const pendingToPush = String(current.pendingName || "").trim();
  const next = [...slots];
  while (next.length <= levelIndex) next.push({});
  next[levelIndex] = { groupId: selectedGroupId };
  if (pendingToPush) {
    next.splice(levelIndex + 1, 0, { pendingName: pendingToPush });
  }
  return next;
}

function normalizeCreateChainLength(
  slots: MasterEntityGroupCreateChainSlot[]
): MasterEntityGroupCreateChainSlot[] {
  if (slots.length === 0) return [{}];
  return slots;
}

export function MasterEntityNestedGroupFields<G extends MasterGroupListRow = MasterGroupListRow>({
  allGroups,
  config,
  topParentOptions,
  systemBranch,
  onSystemBranchChange,
  parentPathIds,
  onParentPathIdsChange,
  childPathIds = [],
  onChildPathIdsChange,
  chainSlots = [{}],
  onChainSlotsChange,
  onAddNewAtLevel,
  groupName,
  onGroupNameChange,
  mode = "create",
  editingGroup = null,
  disabled = false,
  formResetKey,
  excludeGroupId,
  legacyParentIds,
  editLevel0Trailing,
}: MasterEntityNestedGroupFieldsProps<G>) {
  const isEdit = mode === "edit" && Boolean(editingGroup?.id);
  const isCreate = mode === "create";
  const [slotCount, setSlotCount] = useState(1);

  useEffect(() => {
    if (isCreate) {
      setSlotCount(Math.max(1, chainSlots.length || 1));
      return;
    }
    const extraSlots = isEdit ? childPathIds.length : parentPathIds.length;
    setSlotCount(Math.max(1, extraSlots || 1));
  }, [formResetKey, parentPathIds.length, childPathIds.length, chainSlots.length, isCreate, isEdit]);

  const listOpts = { legacyParentIds };

  const handleBranchChange = (value: string) => {
    onSystemBranchChange(value);
    if (isCreate) {
      onChainSlotsChange?.([{}]);
      setSlotCount(1);
      return;
    }
    if (!isEdit) onParentPathIdsChange([]);
    setSlotCount(1);
  };

  const setCreateSlots = (slots: MasterEntityGroupCreateChainSlot[]) => {
    const normalized = normalizeCreateChainLength(slots);
    onChainSlotsChange?.(normalized);
    setSlotCount(Math.max(1, normalized.length));
  };

  const handleCreateLevelChange = (levelIndex: number, value: string, newName?: string) => {
    const slots = normalizeCreateChainLength([...chainSlots]);
    while (slots.length <= levelIndex) slots.push({});

    if (value === "add-new" && newName?.trim()) {
      slots[levelIndex] = { pendingName: newName.trim() };
      setCreateSlots(slots.slice(0, levelIndex + 1));
      return;
    }

    const pendingFromValue = parseMasterEntityGroupPendingSlotValue(value);
    if (pendingFromValue) {
      slots[levelIndex] = { pendingName: pendingFromValue };
      setCreateSlots(slots.slice(0, levelIndex + 1));
      return;
    }

    if (levelIndex === 0 && value === MASTER_ENTITY_GROUP_STEPPED_DIRECT) {
      slots[0] = {};
      setCreateSlots([{}]);
      return;
    }

    const current = getCreateSlot(slots, levelIndex);
    if (current.pendingName?.trim() && value !== current.groupId) {
      const pushed = pushPendingDownOnExistingSelect(slots, levelIndex, value);
      setCreateSlots(pushed);
      return;
    }

    slots[levelIndex] = { groupId: value };
    setCreateSlots(slots.slice(0, levelIndex + 1));
  };

  const handleLevelChange = (levelIndex: number, value: string, newName?: string) => {
    if (isCreate) {
      handleCreateLevelChange(levelIndex, value, newName);
      return;
    }

    if (value === "add-new" && newName?.trim()) {
      if (levelIndex === 0) {
        onGroupNameChange(newName.trim());
        if (!isEdit) onParentPathIdsChange([]);
        return;
      }
      onAddNewAtLevel?.(levelIndex, newName.trim());
      return;
    }

    if (isEdit && levelIndex === 0) return;

    if (isEdit) {
      const childIndex = levelIndex - 1;
      const next = [...childPathIds];
      next[childIndex] = value;
      onChildPathIdsChange?.(next.slice(0, childIndex + 1));
      return;
    }

    const next = [...parentPathIds];
    if (levelIndex === 0 && value === MASTER_ENTITY_GROUP_STEPPED_DIRECT) {
      onParentPathIdsChange([]);
      onGroupNameChange("");
      return;
    }
    next[levelIndex] = value;
    onParentPathIdsChange(next.slice(0, levelIndex + 1));
    if (levelIndex === 0) {
      const picked = allGroups.find((g) => g.id === value);
      if (picked?.name) onGroupNameChange(picked.name);
    }
  };

  const addChildGroupSlot = () => {
    if (isCreate) {
      setCreateSlots([...normalizeCreateChainLength([...chainSlots]), {}]);
      return;
    }
    if (isEdit) {
      setSlotCount((c) => c + 1);
      return;
    }
    if (slotCount >= 1 && !parentPathIds[0] && slotCount === 1 && !groupName.trim()) {
      setSlotCount(2);
      return;
    }
    const prevIndex = slotCount - 1;
    if (prevIndex > 0 && !parentPathIds[prevIndex - 1]) return;
    setSlotCount((c) => c + 1);
  };

  const removeSlot = (pathIndex: number) => {
    if (isCreate) {
      const next = normalizeCreateChainLength([...chainSlots]).filter((_, i) => i !== pathIndex);
      setCreateSlots(next.length > 0 ? next : [{}]);
      return;
    }
    if (isEdit) {
      onChildPathIdsChange?.(childPathIds.filter((_, i) => i !== pathIndex));
      setSlotCount((c) => Math.max(1, c - 1));
      return;
    }
    const next = parentPathIds.filter((_, i) => i !== pathIndex);
    onParentPathIdsChange(next);
    setSlotCount((c) => Math.max(1, c - 1));
  };

  const parentGroupPlaceholder = (levelIndex: number) =>
    levelIndex === 0
      ? "Optional — leave empty for direct under system group"
      : `Search ${nestedLevelLabel(levelIndex).toLowerCase()}...`;

  const renderCreateLevelSlot = (levelIndex: number) => {
    const slot = getCreateSlot(chainSlots, levelIndex);
    const parentForLevel = resolveCreateParentForLevel(systemBranch, chainSlots, levelIndex);
    const levelDisabled =
      disabled ||
      (levelIndex > 0 &&
        isMasterEntityGroupCreateChainSlotEmpty(getCreateSlot(chainSlots, levelIndex - 1)));

    const options =
      levelIndex === 0
        ? listMasterEntityGroupLevelOptions(
            allGroups,
            config,
            systemBranch,
            [],
            0,
            excludeGroupId,
            listOpts
          )
        : listMasterEntityGroupChildrenForParent(allGroups, String(parentForLevel), excludeGroupId);

    const pendingName = String(slot.pendingName || "").trim();
    const comboboxOptions =
      levelIndex === 0
        ? [
            ...(pendingName
              ? [{ value: masterEntityGroupPendingSlotValue(pendingName), label: pendingName }]
              : []),
            ...options.map((g) => ({ value: g.id, label: g.name })),
          ]
        : [
            ...(pendingName
              ? [{ value: masterEntityGroupPendingSlotValue(pendingName), label: pendingName }]
              : []),
            ...options.map((g) => ({ value: g.id, label: g.name })),
          ];

    const selectedValue = slotToComboboxValue(slot, levelIndex);
    const indentPx = (levelIndex + 1) * MASTER_ENTITY_NESTED_FORM_INDENT_PX;
    const canRemove =
      slotCount > 1 && (levelIndex > 0 || !isMasterEntityGroupCreateChainSlotEmpty(slot));

    return (
      <div
        key={`create-slot-${levelIndex}`}
        className="flex items-start gap-1.5"
        style={{ marginLeft: `${indentPx}px` }}
      >
        <div className="min-w-0 flex-1 space-y-1.5">
          <Label>{nestedLevelLabel(levelIndex)}</Label>
          <Combobox
            options={comboboxOptions}
            value={selectedValue}
            onChange={(val, newName) => handleLevelChange(levelIndex, val, newName)}
            placeholder={parentGroupPlaceholder(levelIndex)}
            searchPlaceholder="Search..."
            addNewLabel="+ Add New"
            disabled={levelDisabled}
            popoverModal={false}
            autoFocusSearchOnOpen
          />
        </div>
        {canRemove ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="mt-7 h-8 w-8 shrink-0 text-destructive hover:text-destructive"
            aria-label="Remove group field"
            onClick={() => removeSlot(levelIndex)}
            disabled={disabled}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        ) : null}
      </div>
    );
  };

  const renderLevelSlot = (levelIndex: number) => {
    if (isCreate) return renderCreateLevelSlot(levelIndex);

    if (isEdit && levelIndex === 0) {
      const indentPx = MASTER_ENTITY_NESTED_FORM_INDENT_PX;
      return (
        <div
          key="edit-level-0"
          className="flex items-start gap-1.5"
          style={{ marginLeft: `${indentPx}px` }}
        >
          <div className="min-w-0 flex-1 space-y-1.5">
            <Label>Group name</Label>
            <div className="flex items-center gap-1.5">
              <Input
                value={groupName}
                onChange={(e) => onGroupNameChange(e.target.value)}
                placeholder="Group name"
                disabled={disabled}
                className="h-9 min-w-0 flex-1"
              />
              {editLevel0Trailing ? <div className="shrink-0">{editLevel0Trailing}</div> : null}
            </div>
          </div>
        </div>
      );
    }

    const pathIndex = isEdit ? levelIndex - 1 : levelIndex;
    const activePathIds = isEdit ? childPathIds : parentPathIds;
    const parentForLevel =
      levelIndex === 0
        ? systemBranch
        : isEdit && levelIndex === 1
          ? editingGroup!.id
          : isEdit
            ? childPathIds[pathIndex - 1] || editingGroup!.id
            : parentPathIds[pathIndex - 1] || systemBranch;

    const levelDisabled = disabled || (levelIndex > 1 && !activePathIds[pathIndex - 1]);

    const options =
      levelIndex === 0
        ? listMasterEntityGroupLevelOptions(
            allGroups,
            config,
            systemBranch,
            parentPathIds,
            0,
            excludeGroupId,
            listOpts
          )
        : parentForLevel
          ? listMasterEntityGroupChildrenForParent(allGroups, String(parentForLevel), excludeGroupId)
          : [];

    const comboboxOptions = options.map((g) => ({ value: g.id, label: g.name }));

    const selectedValue = activePathIds[pathIndex] || "";

    const indentPx = (levelIndex + 1) * MASTER_ENTITY_NESTED_FORM_INDENT_PX;

    return (
      <div
        key={`parent-slot-${levelIndex}`}
        className="flex items-start gap-1.5"
        style={{ marginLeft: `${indentPx}px` }}
      >
        <div className="min-w-0 flex-1 space-y-1.5">
          <Label>{nestedLevelLabel(levelIndex)}</Label>
          <Combobox
            options={comboboxOptions}
            value={selectedValue}
            onChange={(val, newName) => handleLevelChange(levelIndex, val, newName)}
            placeholder={parentGroupPlaceholder(levelIndex)}
            searchPlaceholder="Search..."
            addNewLabel="+ Add New"
            disabled={levelDisabled}
            popoverModal={false}
            autoFocusSearchOnOpen
          />
        </div>
        {slotCount > 1 && pathIndex >= 0 && !activePathIds[pathIndex] ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="mt-7 h-8 w-8 shrink-0 text-destructive hover:text-destructive"
            aria-label="Remove empty group field"
            onClick={() => removeSlot(pathIndex)}
            disabled={disabled}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        ) : null}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>System group</Label>
        <Select value={systemBranch} onValueChange={handleBranchChange} disabled={disabled}>
          <SelectTrigger>
            <SelectValue placeholder="Select system group" />
          </SelectTrigger>
          <SelectContent>
            {topParentOptions.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {Array.from({ length: slotCount }).map((_, levelIndex) => renderLevelSlot(levelIndex))}

      <div style={{ marginLeft: `${2 * MASTER_ENTITY_NESTED_FORM_INDENT_PX}px` }}>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          onClick={addChildGroupSlot}
          disabled={disabled}
        >
          <Plus className="h-3.5 w-3.5" />
          Add Child group
        </Button>
      </div>
    </div>
  );
}
