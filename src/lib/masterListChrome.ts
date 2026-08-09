import { cn } from "@/lib/utils";
import { masterListUnselectedCn } from "@/lib/listSelectionChrome";
import { mlc } from "@/lib/mobileListChrome";

/** Master-detail list pane shell — Tax page screenshot / `TaxGroupList` jaisa. Soft mint parent chrome se aata hai. */
export const masterListShellCn =
  "flex h-full min-h-0 min-w-0 w-full flex-col rounded-b-lg border-t-0 bg-transparent";

/** Scroll body — category groups (PartyGroupList); rows `pl-master-list-ul` se 2px inset */
export const masterListScrollBodyCn = "w-full min-w-0 space-y-2 pb-2";

/** PartyGroupList category header — cards jaisa dono taraf 2px (mlc.sectionLabelRow = px-2) */
export const masterListCategoryLabelCn = cn(
  mlc.sectionLabelRow,
  "px-[2px]"
);

/** `MasterListRow` par extra class — selected orange `MasterListRow` + Pro CSS se aata hai. */
export function masterListRowUnselectedCn(isSelected: boolean, extra?: string) {
  return cn(!isSelected && masterListUnselectedCn, extra);
}
