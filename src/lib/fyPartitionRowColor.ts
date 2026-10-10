export const FY_PARTITION_ROW_COLOR_KEY = "pocket-ledger:fy-partition-row-color:v1";
export const FY_PARTITION_START_ROW_COLOR_KEY = "pocket-ledger:fy-partition-start-row-color:v1";
export const FY_PARTITION_ROW_COLOR_CHANGED_EVENT = "pl-fy-partition-row-color-changed";

export const FY_PARTITION_ROW_COLOR_OPTIONS = [
  { value: "default", label: "Default", color: null, borderColor: null },
  { value: "rose", label: "Rose", color: "#ffe4e6", borderColor: "#fda4af" },
  { value: "orange", label: "Orange", color: "#ffedd5", borderColor: "#fdba74" },
  { value: "amber", label: "Amber", color: "#fef3c7", borderColor: "#fcd34d" },
  { value: "yellow", label: "Yellow", color: "#fef9c3", borderColor: "#fde047" },
  { value: "lime", label: "Lime", color: "#ecfccb", borderColor: "#bef264" },
  { value: "green", label: "Green", color: "#dcfce7", borderColor: "#86efac" },
  { value: "emerald", label: "Emerald", color: "#d1fae5", borderColor: "#6ee7b7" },
  { value: "cyan", label: "Cyan", color: "#cffafe", borderColor: "#67e8f9" },
  { value: "sky", label: "Sky", color: "#e0f2fe", borderColor: "#7dd3fc" },
  { value: "blue", label: "Blue", color: "#dbeafe", borderColor: "#93c5fd" },
  { value: "violet", label: "Violet", color: "#ede9fe", borderColor: "#c4b5fd" },
  { value: "pink", label: "Pink", color: "#fce7f3", borderColor: "#f9a8d4" },
  { value: "gray", label: "Gray", color: "#e5e7eb", borderColor: "#9ca3af" },
] as const;

export type FyPartitionRowColor = (typeof FY_PARTITION_ROW_COLOR_OPTIONS)[number]["value"];
export type FyPartitionRowColorTarget = "start" | "end";

export function parseFyPartitionRowColor(raw: unknown): FyPartitionRowColor {
  const match = FY_PARTITION_ROW_COLOR_OPTIONS.find((option) => option.value === raw);
  return match?.value ?? "default";
}

export function getFyPartitionRowBackground(color: FyPartitionRowColor): string | null {
  return FY_PARTITION_ROW_COLOR_OPTIONS.find((option) => option.value === color)?.color ?? null;
}

export function readFyPartitionRowColor(target: FyPartitionRowColorTarget = "end"): FyPartitionRowColor {
  if (typeof window === "undefined") return "default";
  try {
    const key = target === "start" ? FY_PARTITION_START_ROW_COLOR_KEY : FY_PARTITION_ROW_COLOR_KEY;
    return parseFyPartitionRowColor(window.localStorage.getItem(key));
  } catch {
    return "default";
  }
}

export function writeFyPartitionRowColor(
  target: FyPartitionRowColorTarget,
  color: FyPartitionRowColor
): void {
  if (typeof window === "undefined") return;
  try {
    const key = target === "start" ? FY_PARTITION_START_ROW_COLOR_KEY : FY_PARTITION_ROW_COLOR_KEY;
    window.localStorage.setItem(key, color);
    window.dispatchEvent(
      new CustomEvent(FY_PARTITION_ROW_COLOR_CHANGED_EVENT, { detail: { target, color } })
    );
  } catch {
    /* Ignore unavailable/private local storage. */
  }
}
