import { cn } from "@/lib/utils";
import { masterListUnselectedCn } from "@/lib/listSelectionChrome";

/** Master-detail list pane shell — Tax page screenshot / `TaxGroupList` jaisa. */
export const masterListShellCn =
  "flex h-full min-h-0 min-w-0 w-full flex-col rounded-b-lg border-t-0 bg-background";

/** `MasterListRow` par extra class — selected orange `MasterListRow` + Pro CSS se aata hai. */
export function masterListRowUnselectedCn(isSelected: boolean, extra?: string) {
  return cn(!isSelected && masterListUnselectedCn, extra);
}
