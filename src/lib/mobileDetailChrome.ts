/**
 * Mobile detail / register chrome — ek spacing scale (party, group, staff, bank, tax, items, reports).
 * Upar ka header/balance/toolbar compact; neeche txn list ko zyada scroll height.
 */

/** Left edge menu swipe / `preventDefault` strip se exclude — back row + header buttons */
export const mdcNoEdgeSwipeCapture = {
  "data-pl-no-edge-swipe-capture": "",
  "data-pl-mobile-back-row": "",
} as const;

export const mdc = {
  /** Back + page title + entity name (PartyDetails onBack, StaffDetails, …) */
  inlineBackRow: "flex flex-shrink-0 items-center gap-1 border-b px-2 py-0.5",
  backBtn: "h-6 w-6 flex-shrink-0",
  backIcon: "h-3 w-3",
  pageTitleMuted: "shrink-0 text-sm font-bold text-muted-foreground",
  entityName: "min-w-0 flex-1 truncate text-xs font-medium",

  /** "All Time" / date range chip */
  dateRow: "flex flex-shrink-0 items-center justify-center gap-1 border-b px-2 py-0.5",
  dateLabel: "text-[11px] font-medium leading-tight text-muted-foreground",

  /** Closing balance / To Receive row */
  balanceRow: "flex-shrink-0 border-b px-2 py-1",
  balanceTextCenter: "text-center text-lg font-bold leading-tight",
  balanceTextFlex: "text-lg font-bold leading-tight flex justify-center items-baseline gap-px",

  /** Combobox + edit + search toolbar */
  toolbarRow: "flex-shrink-0 border-b px-2 py-1",
  toolbarInner: "flex items-stretch gap-1.5",
  comboboxWrap: "h-8 min-w-0 flex-1 [&_button]:h-8 [&_button]:text-xs",
  /** Bank/Cash combobox — green ring; `border` (not `border-2`) taaki h-8 row party jitni compact rahe */
  comboboxTriggerBank:
    "w-full min-w-0 border border-green-600 focus-visible:ring-2 focus-visible:ring-green-600/35",
  iconBtn: "h-8 w-8 flex-shrink-0",
  iconSm: "h-3.5 w-3.5",
  searchWrap: "relative h-8 min-w-0 flex-1",
  searchIcon:
    "pointer-events-none absolute left-2 top-1/2 z-10 h-3 w-3 -translate-y-1/2 text-muted-foreground",
  searchInput: "h-8 w-full min-w-0 pl-7 text-xs",

  /** Summary collapse FAB — fixed (report list, bina pager); z-40 = dialog overlay (z-50) ke neeche */
  summaryFab:
    "pointer-events-auto fixed right-3 z-40 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-lg backdrop-blur-md hover:bg-muted active:scale-95",
  /** Report list: action footer ke upar */
  summaryFabPosition:
    "bottom-[calc(env(safe-area-inset-bottom,0px)+3.25rem)]",
  /** Pagination row ke just upar — MobileTransactionsPager wrapper me absolute */
  summaryFabInline:
    "pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-md hover:bg-muted active:scale-95",
  summaryFabIcon: "h-5 w-5",

  /** Report register detail back (Sale/Purchase/Payment … mobile) */
  reportBackRow: "flex flex-shrink-0 items-center gap-1 border-b px-2 py-0.5",
  reportBackBtn: "h-6 w-6",
  reportBackIcon: "h-3 w-3",
  reportBackTitle: "truncate text-sm font-semibold",

  /** Report register LIST (before entity select) — ReportRegisterMobileListChrome */
  listHeader: "sticky top-0 z-10 flex flex-shrink-0 flex-col gap-1 border-b bg-background px-2 py-1",
  listTitle: "text-sm font-bold text-muted-foreground",
  listSubtitle: "text-[11px] font-medium leading-tight text-muted-foreground",
  listSummaryCard: "p-2 text-center",
  listSummaryLabel: "text-[11px] text-muted-foreground",
  listSummaryAmount: "text-lg font-bold leading-tight",
  listSearchRow: "flex-shrink-0 border-b bg-background px-2 py-1",
  listSearchWrap: "relative",
  listSearchIcon:
    "pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground",
  listSearchInput: "h-8 w-full pl-8 text-xs",
  listSectionRow: "flex-shrink-0 border-b bg-background px-2 pb-0.5 pt-1",
  listSectionTitle: "text-xs font-semibold",

  /** Master-detail shell (ResponsiveMasterDetail mobile detail) */
  masterBackRow: "flex flex-shrink-0 items-center gap-1 border-b px-2 py-0.5",
  masterTitle: "shrink-0 text-sm font-bold",
  masterSelectionName: "min-w-0 truncate text-xs font-medium",
  masterAvatarSlot: "flex h-7 w-7 items-center justify-center border-l border-border p-px",

  /** AccountDetails report chrome (Contra/Journal mobile) */
  reportChromeHeader: "z-10 flex flex-shrink-0 flex-col gap-1 border-b bg-background px-2 py-1",
  reportChromeTitleRow: "flex min-w-0 items-center gap-1",
  reportChromeTitle: "shrink-0 text-sm font-bold text-muted-foreground",
  reportChromeEntity: "min-w-0 truncate text-xs font-medium",
  reportChromeBalance: "shrink-0 whitespace-nowrap text-xs font-bold",
} as const;
