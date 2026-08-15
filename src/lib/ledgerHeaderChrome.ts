/**
 * Ledger / detail / report header action pills — ~27px (h-7 was 28px).
 * Party, Staff, Bank, Tax, Items, Groups, embedded report views sab me same height.
 */
import { chromeProPillCn } from "@/lib/chromePillButton";
import { cn } from "@/lib/utils";

export const LEDGER_HEADER_PILL_CN = "h-[27px] min-h-[27px] flex-shrink-0 px-2.5 text-xs";
export const LEDGER_HEADER_PILL_ICON_CN = "h-[27px] w-[27px] min-h-[27px] flex-shrink-0";
/** Pill ke andar icon — height ke saath proportion */
export const LEDGER_HEADER_PILL_ICON_SIZE_CN = "h-3.5 w-3.5";
/**
 * Right 50% of ribbon — pills (andar H-scroll).
 */
export const LEDGER_HEADER_PILL_ROW_CN =
  "pl-ledger-header-card pl-ledger-header-pill-row justify-start gap-1";
/** Outer ribbon wrap — top/bottom gap 2px; pill-blue strip */
export const LEDGER_HEADER_RIBBON_WRAP_CN =
  "pl-ledger-header-ribbon-wrap border-b px-3 py-[2px] overflow-x-auto min-h-0 scrollbar-slim-dim";
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
