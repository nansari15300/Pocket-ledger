/**
 * Ledger / detail / report header action pills — ~27px (h-7 was 28px).
 * Party, Staff, Bank, Tax, Items, Groups, embedded report views sab me same height.
 */
import { chromeProPillCn } from "@/lib/chromePillButton";
import { cn } from "@/lib/utils";

export const LEDGER_HEADER_PILL_CN = "h-[27px] min-h-[27px] flex-shrink-0 px-2.5 text-xs";
/** Date-range trigger — bold blue + glow via globals `.pl-ledger-header-pill-row button[data-theme-detail="date-range"]`. */
export const LEDGER_DATE_RANGE_PILL_CN = cn(
  LEDGER_HEADER_PILL_CN,
  "font-semibold text-blue-900"
);
export const LEDGER_HEADER_PILL_ICON_CN = "h-[27px] w-[27px] min-h-[27px] flex-shrink-0";
/** Pill ke andar icon — height ke saath proportion */
export const LEDGER_HEADER_PILL_ICON_SIZE_CN = "h-3.5 w-3.5";
/**
 * Right 50% of ribbon — pills wrap; 3 rows ke baad V-scroll (global CSS).
 */
export const LEDGER_HEADER_PILL_ROW_CN =
  "pl-ledger-header-card pl-ledger-header-pill-row justify-start gap-[3px]";
/** Outer ribbon wrap — sides/bottom gap; pill-blue strip (top flush on txn pages via CSS) */
export const LEDGER_HEADER_RIBBON_WRAP_CN =
  "pl-ledger-header-ribbon-wrap shrink-0 border-b px-[3px] py-[3px] overflow-x-auto min-h-0 scrollbar-slim-dim";
/** Right inset on entity txn pages — matches Dashboard Recent edge gap. */
export const LEDGER_TXN_PAGE_EDGE_GAP_PX = 2;
/** Ledger detail pane: fixed ribbon + scrollable table (desktop). */
export const LEDGER_TXN_PAGE_ROOT_CN =
  "flex h-full min-h-0 w-full max-w-full flex-1 flex-col overflow-hidden box-border";
/** Single H-scroll owner (table + footer move together). */
export const LEDGER_TXN_SCROLL_HOST_CN =
  "pl-ledger-txn-scroll-host flex min-h-0 min-w-0 flex-1 flex-col overflow-x-auto overflow-y-hidden pl-ledger-txn-scroll-native";
export const LEDGER_TXN_SCROLL_INNER_CN =
  "pl-ledger-txn-scroll-host-inner flex min-h-0 min-w-full flex-1 flex-col";
export const LEDGER_TXN_TABLE_HOST_CN =
  "pl-ledger-txn-table-host flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden";
/** Ribbon slot inside unified H-scroll — width follows table min width. */
export const LEDGER_TXN_SCROLL_HEADER_CN =
  "pl-ledger-txn-scroll-header shrink-0 min-w-full w-full box-border";
/** Entity ledger split table: Type pill (incl. FY opening label) fit + colgroup sync. */
export const LEDGER_ENTITY_TYPE_COL_PX = 120;
/** Entity ledger Balance — large formatted amounts + Dr/Cr suffix. */
export const LEDGER_ENTITY_BALANCE_COL_PX = 132;
/** Compact visual strip after Balance; the visible ⋮ sits 4px from the right edge. */
export const LEDGER_TXN_ROW_MENU_COL_PX = 12;
export const LEDGER_TXN_ROW_MENU_CELL_CN =
  "relative box-border w-3 min-w-[12px] max-w-[12px] p-0 align-middle";
/** Header stays aligned at the Balance column's right boundary. */
export const LEDGER_TXN_BALANCE_HEADER_PAD_CN = "pl-[10px] pr-0";
/** Body amount/Dr/Cr: 10px visual gap from ⋮; right-edge gap stays unchanged. */
export const LEDGER_TXN_BALANCE_TO_MENU_PAD_CN = "pl-[10px] pr-[6px]";

/** Outer ribbon — 50/50; overflow parent pe H-scroll jab left floor tight ho */
export const LEDGER_HEADER_OUTER_ROW_CN =
  "pl-ledger-header-outer-row flex w-full flex-nowrap items-stretch gap-1";
/**
 * Left 50%: profile + name (flex) + balance — responsive within half.
 */
export const LEDGER_HEADER_IDENTITY_CN =
  "pl-ledger-header-identity flex items-stretch gap-1";
/** Profile avatar wrap — pen badge overlay */
export const LEDGER_HEADER_AVATAR_CN = "pl-ledger-header-avatar";
/** Pen on profile — same blue as Adjust Balance outline pill */
export const LEDGER_HEADER_AVATAR_PEN_CN = cn(
  "pl-ledger-header-avatar-pen",
  chromeProPillCn
);
/** Same pen chrome inline (combobox / form pills) — no avatar absolute overlay */
export const LEDGER_INLINE_EDIT_PEN_CN = cn(
  "pl-ledger-inline-edit-pen",
  chromeProPillCn
);
/** Name card — left half me remaining width; 2-line wrap + … */
export const LEDGER_HEADER_NAME_CARD_CN =
  "pl-ledger-header-card pl-ledger-header-name-card justify-start";
/** Balance card — Balance label + amount only (edit pen on profile) */
export const LEDGER_HEADER_BALANCE_CARD_CN = "pl-ledger-header-balance-card";
export const LEDGER_HEADER_BALANCE_STACK_CN = "pl-ledger-header-balance-stack";
export const LEDGER_HEADER_BALANCE_LABEL_CN = "pl-ledger-header-balance-label";
/** Title in name card */
export const LEDGER_HEADER_TITLE_CN =
  "pl-ledger-header-title text-xl font-semibold leading-6";
/** Amount under Balance label */
export const LEDGER_HEADER_BALANCE_CN =
  "pl-ledger-header-balance text-base font-bold";

/** Closing Balance footer card: pills wrap instead of overlapping the total. */
export const LEDGER_CLOSING_BALANCE_CARD_ROW_CN =
  "flex w-full min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5";
export const LEDGER_CLOSING_BALANCE_ACTIONS_CN =
  "flex min-w-0 max-w-full flex-[1_1_12rem] flex-wrap items-center gap-2";
export const LEDGER_CLOSING_BALANCE_TOTAL_CN =
  "ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1.5";
