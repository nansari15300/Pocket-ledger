/**
 * Ledger / detail / report header action pills — h-10 (40px) se ~30% chota (h-7 = 28px).
 * Party, Staff, Bank, Tax, Items, Groups, embedded report views sab me same height.
 */
export const LEDGER_HEADER_PILL_CN = "h-7 min-h-7 flex-shrink-0 px-2.5 text-xs";
export const LEDGER_HEADER_PILL_ICON_CN = "h-7 w-7 min-h-7 flex-shrink-0";
/** Pill ke andar icon — height ke saath proportion */
export const LEDGER_HEADER_PILL_ICON_SIZE_CN = "h-3.5 w-3.5";
/** Header action pills row — cluster/pill gap ek hi (gap-1.5); justify-start taaki beech me bada gap na aaye */
export const LEDGER_HEADER_PILL_ROW_CN =
  "flex flex-shrink-0 flex-nowrap items-center justify-start gap-1.5 overflow-x-auto scrollbar-slim-dim";
/** Outer header: identity cluster + pills — same gap as pills */
export const LEDGER_HEADER_OUTER_ROW_CN = "flex flex-nowrap items-center gap-1.5 min-w-0";
/** Avatar + title + edit + balance */
export const LEDGER_HEADER_IDENTITY_CN = "flex min-w-0 flex-1 items-center gap-1.5";
/**
 * Entity/group title: chhoti width pe max 2 line, avatar h-12 (leading-6×2) ke andar;
 * pattika height nahi badhe; uske baad clamp (never wrap beyond 2).
 */
export const LEDGER_HEADER_TITLE_CN =
  "min-w-0 flex-1 text-xl font-semibold leading-6 line-clamp-2 break-words";
