/** Overdue list: Important / Normal filter — sale/purchase `overdueImportant` tick se */
export type OverdueImportanceFilter = "all" | "important" | "normal";

const STORAGE_KEY = "overdueImportanceFilter";

export function readOverdueImportanceFilter(): OverdueImportanceFilter {
  if (typeof window === "undefined") return "all";
  try {
    const v = sessionStorage.getItem(STORAGE_KEY);
    if (v === "important" || v === "normal" || v === "all") return v;
  } catch {
    /* ignore */
  }
  return "all";
}

export function writeOverdueImportanceFilter(filter: OverdueImportanceFilter): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, filter);
  } catch {
    /* ignore */
  }
}

export function matchesOverdueImportanceFilter(
  row: { overdueImportant?: boolean },
  filter: OverdueImportanceFilter
): boolean {
  if (filter === "all") return true;
  if (filter === "important") return row.overdueImportant === true;
  return row.overdueImportant !== true;
}
