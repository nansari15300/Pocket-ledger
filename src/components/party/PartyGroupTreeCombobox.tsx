"use client";

import { MasterGroupTreeCombobox } from "@/components/entity/MasterGroupTreeCombobox";
import { PARTY_ENTITY_GROUP_PRESET } from "@/lib/masterEntityGroupFormPresets";
import type { PartyGroupComboboxRow } from "@/lib/partyGroupCombobox";

type PartyGroupTreeComboboxProps = {
  groups: PartyGroupComboboxRow[];
  processedGroups?: PartyGroupComboboxRow[];
  value?: string;
  onChange?: (value: string, newName?: string) => void;
  /** Group pick par Debtors/Creditors radio auto-update. */
  onAccountTypeChange?: (branchId: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  addNewLabel?: string;
  disabled?: boolean;
  popoverModal?: boolean;
  confirmWithOk?: boolean;
};

export function PartyGroupTreeCombobox({
  onAccountTypeChange,
  ...props
}: PartyGroupTreeComboboxProps) {
  return (
    <MasterGroupTreeCombobox
      preset={PARTY_ENTITY_GROUP_PRESET}
      onBranchChange={onAccountTypeChange}
      {...props}
    />
  );
}
