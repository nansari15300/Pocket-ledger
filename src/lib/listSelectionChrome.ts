import { cn } from "@/lib/utils";

/** Master-detail list — selected row (orange border + peach bg, group-statement / screenshot). */
export const masterListSelectedCn =
  "border-orange-400 bg-orange-50 shadow-sm dark:border-orange-500 dark:bg-orange-950/40";

/** Unselected — gray border; hover par halka orange hint. */
export const masterListUnselectedCn =
  "border-gray-300 dark:border-gray-600 border-[1.5px] hover:border-orange-300/80 hover:bg-orange-50/30";

export const masterListUnselectedCompactCn =
  "border-gray-300 dark:border-gray-600 hover:border-orange-300/80 hover:bg-orange-50/30";

/** Ledger txn row — selected block border (primary blue ki jagah orange-400). */
const TXN_SEL = "#fb923c";

/** Main transaction row — selected + narration ek orange box. */
export function txnSelectedMainRowCn(showNarrationRow: boolean) {
  return cn(
    "[&>td]:!transition-none [&>td]:bg-orange-50/90 dark:[&>td]:bg-orange-950/35 [&>td:first-child]:overflow-hidden [&>td:last-child]:overflow-hidden",
    `[&>td]:[box-shadow:inset_0_2px_0_0_${TXN_SEL}]`,
    !showNarrationRow && `[&>td]:[box-shadow:inset_0_2px_0_0_${TXN_SEL},inset_0_-2px_0_0_${TXN_SEL}]`,
    `[&>td:first-child]:[box-shadow:inset_2px_0_0_0_${TXN_SEL},inset_0_2px_0_0_${TXN_SEL}]`,
    !showNarrationRow &&
      `[&>td:first-child]:[box-shadow:inset_2px_0_0_0_${TXN_SEL},inset_0_2px_0_0_${TXN_SEL},inset_0_-2px_0_0_${TXN_SEL}]`,
    `[&>td:last-child]:[box-shadow:inset_-2px_0_0_0_${TXN_SEL},inset_0_2px_0_0_${TXN_SEL}]`,
    !showNarrationRow &&
      `[&>td:last-child]:[box-shadow:inset_-2px_0_0_0_${TXN_SEL},inset_0_2px_0_0_${TXN_SEL},inset_0_-2px_0_0_${TXN_SEL}]`,
    !showNarrationRow &&
      "[&>td:first-child]:rounded-tl-xl [&>td:first-child]:rounded-bl-xl [&>td:last-child]:rounded-tr-xl [&>td:last-child]:rounded-br-xl",
    showNarrationRow && "[&>td:first-child]:rounded-tl-xl [&>td:last-child]:rounded-tr-xl"
  );
}

/** Narration sub-row — selected block ka neeche wala hissa. */
export function txnSelectedNarrationRowCn() {
  return cn(
    "[&>td]:!transition-none [&>td]:bg-orange-50/90 dark:[&>td]:bg-orange-950/35",
    `[&>td]:[box-shadow:inset_0_-2px_0_0_${TXN_SEL}]`,
    `[&>td:first-child]:[box-shadow:inset_2px_0_0_0_${TXN_SEL},inset_0_-2px_0_0_${TXN_SEL}]`,
    `[&>td:last-child]:[box-shadow:inset_-2px_0_0_0_${TXN_SEL},inset_0_-2px_0_0_${TXN_SEL}]`,
    "[&>td:first-child]:rounded-bl-xl [&>td:first-child]:overflow-hidden [&>td:last-child]:rounded-br-xl [&>td:last-child]:overflow-hidden"
  );
}
