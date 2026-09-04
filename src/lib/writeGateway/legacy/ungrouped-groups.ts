import { getDefaultSystemGroupId } from "@/lib/masterEntitySystemGroups";
import { PARTY_DEFAULT_SYSTEM_GROUP_ID } from "@/lib/partySystemGroups";

export type UngroupedEntityType = "party" | "staff" | "tax" | "bank" | "expense" | "item";

type UngroupedConfig = {
  collection: string;
  id: string;
  type: string;
  parentId: string | null;
};

const UNGROUPED_CONFIG: Record<UngroupedEntityType, UngroupedConfig> = {
  party: { collection: "groups", id: "ungrouped_party", type: "General", parentId: null },
  staff: { collection: "staff_groups", id: "ungrouped_staff", type: "General", parentId: "loans_liabilities" },
  tax: { collection: "tax_groups", id: "ungrouped_tax", type: "General", parentId: "duties_taxes" },
  bank: { collection: "account_groups", id: "ungrouped_account", type: "General", parentId: "bank_accounts_group" },
  expense: { collection: "expense_groups", id: "ungrouped_expense", type: "General", parentId: null },
  item: { collection: "item_groups", id: "ungrouped_item", type: "General", parentId: null },
};

/** Legacy storage ids — new saves use system branch ids (see masterEntitySystemGroups.ts). */
export function getUngroupedGroupId(type: UngroupedEntityType): string {
  return UNGROUPED_CONFIG[type].id;
}

export async function ensureUngroupedGroup(
  _companyId: string,
  _ownerId: string,
  type: UngroupedEntityType
): Promise<string> {
  if (type === "party") {
    return PARTY_DEFAULT_SYSTEM_GROUP_ID;
  }
  return getDefaultSystemGroupId(type);
}
