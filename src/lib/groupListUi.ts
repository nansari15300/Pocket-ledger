import { cn } from "@/lib/utils";

/** Focus dim — non-bright rows when one group is focused (Income/Expense-style). */
export const GROUP_LIST_FOCUS_DIM_CLASS =
  "opacity-[0.38] saturate-[0.55] transition-opacity duration-200 pointer-events-auto";

/** Expanded group header amount — dim; collapsed — bold. */
export function groupListAmountCn(
  balance: number,
  expanded: boolean,
  toneClassName?: string,
  rowFocusDimmed?: boolean
) {
  return cn(
    "pl-master-list-row-amount-xs ml-1 rounded px-1",
    toneClassName ?? (balance >= 0 ? "text-green-600" : "text-red-600"),
    expanded
      ? rowFocusDimmed
        ? "!font-normal opacity-100"
        : "!font-normal opacity-45"
      : "font-bold opacity-100"
  );
}
