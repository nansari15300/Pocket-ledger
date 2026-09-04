export const SYSTEM_PARENT_GROUP_IDS = {
  groups: ["sundry_debtors", "sundry_creditors"],
  staff_groups: ["loans_liabilities", "staff_system"],
  tax_groups: ["duties_taxes"],
  account_groups: ["bank_accounts_group", "cash_in_hand_group"],
  expense_groups: [],
  item_groups: ["stock_items", "services"],
} as const;

export type SystemGroupCollection = keyof typeof SYSTEM_PARENT_GROUP_IDS;

/**
 * Returns true if the given id is one of our known system parent groups
 * for the specified Firestore subcollection.
 */
export function isSystemParentGroup(
  collection: SystemGroupCollection,
  id: string | undefined
): boolean {
  if (!id) return false;
  const list = SYSTEM_PARENT_GROUP_IDS[collection];
  return Array.isArray(list) && list.includes(id);
}

