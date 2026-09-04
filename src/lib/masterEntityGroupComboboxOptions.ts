import { normalizePartyGroupIdForForm } from "@/lib/partySystemGroups";
import {
  normalizeBankGroupIdForStorage,
  normalizeExpenseGroupIdForStorage,
  normalizeItemGroupIdForStorage,
  normalizeStaffGroupIdForStorage,
  normalizeTaxGroupIdForStorage,
} from "@/lib/masterEntitySystemGroups";
import {
  buildExpenseGroupAccountComboboxOptions,
  resolveExpenseGroupBreadcrumbLabel,
  type ExpenseGroupAccountComboboxOption,
} from "@/lib/expenseGroupTree";
import {
  buildPartyGroupAccountComboboxOptions,
  resolvePartyGroupBreadcrumbLabel,
  type PartyGroupComboboxOption,
} from "@/lib/partyGroupCombobox";
import {
  buildMasterGroupAccountComboboxOptions,
  defaultMasterGroupBreadcrumbLabel,
  type MasterGroupAccountComboboxOption,
} from "@/lib/masterGroupAccountCombobox";
import {
  BANK_ENTITY_GROUP_PRESET,
  ITEM_ENTITY_GROUP_PRESET,
  PARTY_ENTITY_GROUP_PRESET,
  STAFF_ENTITY_GROUP_PRESET,
  TAX_ENTITY_GROUP_PRESET,
} from "@/lib/masterEntityGroupFormPresets";
import { isSystemParentGroup } from "@/lib/system-groups";
import type { MasterGroupListRow } from "@/lib/masterGroupListTree";

export type { PartyGroupComboboxOption, MasterGroupAccountComboboxOption };

type ComboboxGroupRow = MasterGroupListRow & {
  isReportOnly?: boolean;
  isAutoUngrouped?: boolean;
  isDeleted?: boolean;
  isSystemReserved?: boolean;
};

function aliveComboboxRows<G extends ComboboxGroupRow>(groups: G[]): G[] {
  return groups.filter(
    (g) =>
      g?.id &&
      !g.isDeleted &&
      g.isReportOnly !== true &&
      g.isAutoUngrouped !== true
  );
}

export function buildBankAccountGroupComboboxOptions(
  groups: Array<{ id: string; name: string; parentId?: string; isSystemReserved?: boolean; isAutoUngrouped?: boolean; isDeleted?: boolean }>
): MasterGroupAccountComboboxOption[] {
  const preset = BANK_ENTITY_GROUP_PRESET;
  return buildMasterGroupAccountComboboxOptions(
    aliveComboboxRows(groups as ComboboxGroupRow[]),
    preset.config,
    preset.topParentOptions,
    {
      filterRow: (g) => !g.isSystemReserved,
      resolveBreadcrumbLabel: (groupId, rows) =>
        defaultMasterGroupBreadcrumbLabel(
          groupId,
          rows,
          preset.config,
          preset.topParentOptions,
          preset.topParentOptions.find((b) => b.id === preset.defaultBranch)?.name ??
            preset.defaultBranch
        ),
    }
  );
}

export function buildStaffGroupComboboxOptions(
  groups: Array<{ id: string; name: string; parentId?: string; isSystemReserved?: boolean; isAutoUngrouped?: boolean; isDeleted?: boolean }>
): MasterGroupAccountComboboxOption[] {
  const preset = STAFF_ENTITY_GROUP_PRESET;
  return buildMasterGroupAccountComboboxOptions(
    aliveComboboxRows(groups as ComboboxGroupRow[]),
    preset.config,
    preset.topParentOptions,
    {
      filterRow: (g) => !g.isSystemReserved,
    }
  );
}

export function buildTaxGroupComboboxOptions(
  groups: Array<{ id: string; name: string; parentId?: string; isSystemReserved?: boolean; isAutoUngrouped?: boolean; isDeleted?: boolean }>
): MasterGroupAccountComboboxOption[] {
  const preset = TAX_ENTITY_GROUP_PRESET;
  return buildMasterGroupAccountComboboxOptions(
    aliveComboboxRows(groups as ComboboxGroupRow[]),
    preset.config,
    preset.topParentOptions,
    {
      filterRow: (g) => !g.isSystemReserved && !isSystemParentGroup("tax_groups", g.id),
    }
  );
}

export function buildItemGroupComboboxOptions(
  groups: Array<{ id: string; name: string; parentId?: string; isSystemReserved?: boolean; isAutoUngrouped?: boolean; isDeleted?: boolean }>
): MasterGroupAccountComboboxOption[] {
  const preset = ITEM_ENTITY_GROUP_PRESET;
  return buildMasterGroupAccountComboboxOptions(
    aliveComboboxRows(groups as ComboboxGroupRow[]),
    preset.config,
    preset.topParentOptions,
    {
      filterRow: (g) => !isSystemParentGroup("item_groups", g.id),
    }
  );
}

export function buildExpenseGroupComboboxOptions(
  groups: Array<{ id: string; name: string; parentId?: string; isReportOnly?: boolean; isAutoUngrouped?: boolean; isDeleted?: boolean }>
): ExpenseGroupAccountComboboxOption[] {
  return buildExpenseGroupAccountComboboxOptions(groups as Parameters<typeof buildExpenseGroupAccountComboboxOptions>[0]);
}

export function resolveExpenseGroupComboboxLabel(
  groups: Array<{ id: string; name: string; parentId?: string; isReportOnly?: boolean; isAutoUngrouped?: boolean; isDeleted?: boolean }>,
  groupId?: string | null,
  fallback = "Ungrouped"
): string {
  return resolveExpenseGroupBreadcrumbLabel(groupId, groups as Parameters<typeof resolveExpenseGroupBreadcrumbLabel>[1], fallback);
}

export function buildPartyGroupComboboxOptions(
  groups: Array<{ id: string; name: string; parentId?: string; isReportOnly?: boolean; isAutoUngrouped?: boolean; isDeleted?: boolean; isSystemReserved?: boolean }>
): PartyGroupComboboxOption[] {
  return buildPartyGroupAccountComboboxOptions(groups);
}

export function resolvePartyGroupComboboxLabel(
  groups: Array<{ id: string; name: string; parentId?: string }>,
  groupId?: string | null,
  fallback = "Sundry Creditors"
): string {
  return resolvePartyGroupBreadcrumbLabel(groupId, groups, fallback);
}

export function normalizeMasterEntityGroupComboboxValue(
  entity: "bank" | "staff" | "expense" | "party" | "tax" | "item",
  groupId?: string | null,
  context?: { accountType?: string | null; itemType?: string | null }
): string {
  if (entity === "party") {
    return normalizePartyGroupIdForForm(groupId);
  }
  switch (entity) {
    case "bank":
      return normalizeBankGroupIdForStorage(groupId, context?.accountType);
    case "staff":
      return normalizeStaffGroupIdForStorage(groupId, context?.accountType);
    case "tax":
      return normalizeTaxGroupIdForStorage(groupId);
    case "item":
      return normalizeItemGroupIdForStorage(groupId, context?.itemType);
    case "expense":
      return normalizeExpenseGroupIdForStorage(groupId, context?.accountType);
    default:
      return String(groupId ?? "").trim();
  }
}

export { PARTY_ENTITY_GROUP_PRESET };
