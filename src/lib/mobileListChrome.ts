/**
 * Master–detail LIST chrome (party, staff, bank, tax, items, incomes) — compact mobile + APK.
 * Tab row: `TabsList listChrome` (tabs.tsx). Search row: `Input listChrome listChromeSearch`, `Button size="list"`.
 * Action row (Add Salary…): `mlc.actionRow` + buttons `variant="chromePill" size="list"` (header jaisa pill).
 * Pro theme mobile: dashboard rose/pink list shell + rows (`globals.css`); details page green rehta hai.
 */
import { cn } from "@/lib/utils";

export const mlc = {
  /** ResponsiveMasterDetail: page title + total balance — PC height `globals.css` `.pl-mlc-page-header` */
  pageHeader: "pl-mlc-page-header flex-shrink-0 border-b px-2 py-1",
  pageTitle: "min-w-0 flex-1 text-base font-bold font-headline leading-tight",
  pageBalance: "flex-shrink-0 text-sm font-semibold leading-tight tabular-nums",

  /** Tabs wrapper row — andar `TabsList listChrome` */
  tabsRow: "pl-mlc-tabs-row flex-shrink-0 border-b px-2 py-0",

  /** Search + badge + add row */
  searchRow: "pl-mlc-search-row flex flex-shrink-0 items-center gap-1 border-b px-2 py-0",
  searchWrap: "relative min-w-0 flex-1",
  /** Search input ke andar — `Input listChromeSearch` ke saath; pointer-events-none overlap fix */
  searchIcon:
    "pl-mlc-search-icon pointer-events-none absolute left-1.5 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground",

  /** List section label (Accounts (8)…) — PC height `.pl-mlc-section-label-row` */
  sectionLabelRow:
    "pl-mlc-section-label-row flex flex-shrink-0 items-center gap-1.5 border-b px-2 py-0.5 text-xs font-semibold leading-tight text-muted-foreground",
  sectionIcon: "h-3.5 w-3.5",

  actionRow: "pl-mlc-action-row flex-shrink-0 border-b px-2 py-0",
  actionGrid: "grid grid-cols-2 gap-1",
} as const;

/** listView root — `data-pl-master-list-chrome` attribute ResponsiveMasterDetail PC column par */
export const mlcListChromeRoot = "flex flex-col h-full min-h-0";
/** listView wrapper par spread: `{...mlcListChromeRootData}` */
export const mlcListChromeRootData = { "data-pl-master-list-chrome": "" } as const;
