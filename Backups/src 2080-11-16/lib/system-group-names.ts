/**
 * System group names that users cannot use when creating groups.
 * These are reserved system groups that appear in parent group dropdowns.
 */

export const SYSTEM_GROUP_NAMES = {
  // Party groups (main parent groups)
  party: [
    "Assets",
    "Liabilities", 
    "Income",
    "Expenses",
    "Equity",
    "Sundry Debtors",
    "Sundry Creditors",
    "Party", // Common system group name
  ],
  // Tax groups
  tax: [
    "Duties & Taxes",
    "Tax", // Common system group name
  ],
  // Staff groups
  staff: [
    "Loans & Liabilities",
    "Staff", // Common system group name
  ],
  // Account groups
  account: [
    "Bank Accounts",
    "Cash-in-Hand",
    "Bank", // Common system group name
    "Bank & Cash", // Common system group name
  ],
  // Expense groups
  expense: [
    "Direct Income",
    "Indirect Income",
    "Direct Expenses",
    "Indirect Expenses",
    "Income",
    "Expenses",
    "Income & Expense", // Common system group name
    "Income & Expenses", // Common system group name variant
  ],
  // Item groups
  item: [
    "Stock Items",
    "Services",
    "Item", // Common system group name
  ],
} as const;

/**
 * Check if a group name is a system group name for the given type
 */
export function isSystemGroupName(type: keyof typeof SYSTEM_GROUP_NAMES, name: string): boolean {
  const systemNames = SYSTEM_GROUP_NAMES[type];
  const normalizedName = name.trim();
  return systemNames.some(systemName => 
    systemName.toLowerCase() === normalizedName.toLowerCase()
  );
}

/**
 * Get all system group names across all types
 */
export function getAllSystemGroupNames(): string[] {
  return Object.values(SYSTEM_GROUP_NAMES).flat();
}
