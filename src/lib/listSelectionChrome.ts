/** Master-detail list — selected: orange border + peach bg (screenshot / git reference). */
export const masterListSelectedCn =
  "border-[1.5px] border-orange-400 bg-orange-50 shadow-sm dark:border-orange-500 dark:bg-orange-950/40";

/** Unselected — halka gray border; hover color globals.css + group-hover (Link wrap). */
export const masterListUnselectedCn =
  "border border-gray-200 bg-transparent shadow-none transition-[border-color,background-color] duration-200 dark:border-gray-600";

/** TooltipTrigger (party naam) — 4K `button` black-border rule se bachne ke liye shared class + data-pl-list-name */
export const masterListNameTriggerCn =
  "pl-master-list-row-name block w-full cursor-default truncate border-0 border-transparent bg-transparent p-0 text-left shadow-none outline-none appearance-none";

/** Group list naam — `pl-master-list-row-name-strong` */
export const masterListNameTriggerStrongCn =
  "pl-master-list-row-name-strong block w-full cursor-default truncate border-0 border-transparent bg-transparent p-0 text-left shadow-none outline-none appearance-none";

/** Expandable group child member — chhota text taaki card height na badhe */
export const groupListChildMemberNameTriggerCn =
  "pl-master-list-row-name block w-full cursor-default truncate border-0 border-transparent bg-transparent p-0 text-left text-[11px] font-medium leading-tight shadow-none outline-none appearance-none";

export const masterListUnselectedCompactCn =
  "border border-gray-200 bg-transparent shadow-none transition-[border-color,background-color] duration-200 dark:border-gray-600";

/** Ledger txn row — selected: flat bg highlight (globals.css theme color); box outline nahi. */
export function txnSelectedMainRowCn(_showNarrationRow: boolean) {
  return "[&>td]:!transition-none [&>td]:bg-orange-50/90 dark:[&>td]:bg-orange-950/35";
}

/** Narration sub-row — selected txn block ka neeche wala hissa (same flat bg). */
export function txnSelectedNarrationRowCn() {
  return "[&>td]:!transition-none [&>td]:bg-orange-50/90 dark:[&>td]:bg-orange-950/35";
}

/** Transaction table — header filter + row 3-dot: circle border/ring hatao (`data-pl-txn-icon-btn`). */
export const txnTableIconBtnCn =
  "rounded-sm border-0 shadow-none ring-0 ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0 hover:bg-muted/40";
