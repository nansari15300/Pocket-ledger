/** User-facing label for the `staff` master entity (employees + loan liabilities). */
export const STAFF_ENTITY_LABEL = "Loan & Staff";

/** Internal type key — vouchers, notes, payees, reports (unchanged). */
export const STAFF_ENTITY_TYPE_KEY = "Staff" as const;

export const STAFF_ENTITY_GROUPS_LABEL = "Loan & Staff Groups";

export const STAFF_ENTITY_SEARCH_PLACEHOLDER = "Search loan & staff...";

export const STAFF_ENTITY_ADD_BUTTON = "+ Add Account";

export const STAFF_ENTITY_ADD_LABEL = "Add Account";

/** Report list / category headings where internal key stays `"Staff"`. */
export function reportCategoryDisplayName(category: string): string {
  return category === STAFF_ENTITY_TYPE_KEY ? STAFF_ENTITY_LABEL : category;
}

/** Map stored type keys (`Staff`, `staff`) to display label. */
export function staffEntityDisplayLabel(value: string | null | undefined): string {
  const v = String(value || "").trim();
  if (v === STAFF_ENTITY_TYPE_KEY || v.toLowerCase() === "staff") return STAFF_ENTITY_LABEL;
  return v;
}
