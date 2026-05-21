/**
 * Messages page — header `chromePill` jaisi tab strip + blue notification badge.
 */
import { cn } from "@/lib/utils";
import { chromeProPillCn } from "@/lib/chromePillButton";

/** Tab strip outer — scroll + upar/neeche padding taaki ring/border cut na ho */
export const messagesTabRibbonClassName =
  "w-full min-h-[3.25rem] overflow-x-auto overflow-y-visible py-2 px-0.5";

/** Alerts / Auto / Chat / Alarms — `TabsList` (`!h-auto` = default `h-10` override) */
export const messagesTabListClassName =
  "mb-0 flex !h-auto min-h-[2.75rem] w-full flex-wrap items-center gap-2.5 overflow-visible bg-transparent p-1";

/** Har tab trigger — header pill color; selected = wahi fill + green border */
export const messagesTabTriggerClassName = cn(
  chromeProPillCn,
  "box-border inline-flex h-10 min-h-10 flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium shadow-none ring-offset-2 sm:flex-initial sm:gap-2",
  "data-[state=active]:border-2 data-[state=active]:border-green-600 data-[state=active]:ring-2 data-[state=active]:ring-green-600/35",
  "data-[state=active]:odd:!border-green-600 data-[state=active]:even:!border-green-600",
  "data-[state=inactive]:hover:odd:bg-blue-200/80 data-[state=inactive]:hover:even:bg-indigo-200/80"
);

/** Tab par inline count — absolute badge scroll/overflow se cut na ho */
export const messagesTabUnreadBadgeClassName =
  "flex h-4 min-w-[1rem] shrink-0 items-center justify-center rounded-full border-0 bg-blue-600 px-1 text-[10px] font-bold leading-none text-white";

/** Sidebar Messages nav icon badge */
export const messagesSidebarNavBadgeClassName =
  "absolute top-0 right-0 flex h-4 min-w-[1rem] translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-blue-600 px-0.5 text-[10px] font-bold text-white";
