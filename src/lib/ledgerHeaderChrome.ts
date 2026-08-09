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
/**
 * Entity/group title: max 2 line (avatar h-12 / leading-6×2), pattika height nahi badhe.
 * Mobile: shrink OK. PC/EXE: min width taaki wrap pe full name dikhe — ellipsis sirf jab 2 line me bhi na aaye.
 */
export const LEDGER_HEADER_TITLE_CN =
  "min-w-0 flex-1 text-xl font-semibold leading-6 line-clamp-2 break-words md:min-w-[min(22rem,42vw)] md:max-w-[min(36rem,52vw)]";
/** Avatar + title + edit + balance — PC pe naam squeeze mat karo; pills overflow-x scroll */
export const LEDGER_HEADER_IDENTITY_CN =
  "flex min-w-0 flex-1 items-center gap-1.5 md:min-w-[min(28rem,58vw)] md:shrink-0 md:grow";
