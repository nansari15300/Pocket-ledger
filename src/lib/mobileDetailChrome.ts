/**
 * Mobile detail / register chrome — ek spacing scale (party, group, staff, bank, tax, items, reports).
 * Upar ka header/balance/toolbar compact; neeche txn list ko zyada scroll height.
 */
import { LEDGER_HEADER_AVATAR_BOX_CN } from "@/lib/ledgerHeaderChrome";

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
  dateRow: "flex flex-shrink-0 items-center justify-center gap-1 border-b border-blue-300/80 px-2 py-0.5",
  mobileTxnDateRow: "flex flex-shrink-0 items-center justify-center gap-1 border-b border-blue-300/80 px-2 py-0.5",
  dateLabel: "text-[11px] font-medium leading-tight text-muted-foreground",

  /** Closing balance row — mobile: H-line se text 3px (`data-pl-mobile-txn-balance-row`) */
  balanceRow: "flex-shrink-0 border-b border-blue-300/80 px-3 py-[3px]",
  mobileTxnBalanceRow:
    "flex w-full flex-shrink-0 items-center justify-center border-b border-blue-300/80 px-3 py-[3px] text-center",
  /** Item stock row: unit select same line */
  mobileTxnBalanceRowInline:
    "flex flex-shrink-0 items-center justify-center gap-2 border-b border-blue-300/80 px-2 py-[3px]",
  mobileTxnBalanceText2xl: "m-0 text-center text-2xl font-bold leading-tight",
  mobileTxnBalanceText2xlFlex: "m-0 text-2xl font-bold leading-tight flex justify-center items-baseline gap-px",
  mobileTxnBalanceTextLg: "m-0 text-center text-lg font-bold leading-tight",
  mobileTxnBalanceTextLgFlex: "m-0 text-lg font-bold leading-tight flex justify-center items-baseline gap-px",
  /** @deprecated use mobileTxnBalanceTextLg* */
  balanceTextCenter: "m-0 text-center text-lg font-bold leading-tight",
  balanceTextFlex: "m-0 text-lg font-bold leading-tight flex justify-center items-baseline gap-px",

  /** Entity picker + edit + search — 2px from H-lines; combobox = search box (CSS on data attr) */
  mobileTxnToolbarRow:
    "flex-shrink-0 border-b border-blue-300/80 px-[2px] py-[2px] box-border",
  /** Pagination strip ke turant neeche — pager ke saath ek band (CSS se pager border-bottom hata). */
  mobileTxnToolbarRowBelowPager:
    "flex-shrink-0 px-[2px] pt-[2px] pb-0 box-border",
  mobileTxnToolbarInner: "flex min-w-0 items-stretch gap-[2px]",
  mobileTxnToolbarInnerContent: "flex min-w-0 flex-1 items-stretch gap-[2px]",
  mobileTxnToolbarPickerWrap: "min-w-0 flex-1 [&_button[role=combobox]]:w-full [&_button[role=combobox]]:min-w-0",
  mobileTxnToolbarEditBtn:
    "h-[var(--pl-mobile-txn-toolbar-h,2.25rem)] w-8 min-w-8 shrink-0 rounded-md border-blue-300 bg-white shadow-sm",
  mobileTxnToolbarSearchWrap: "relative min-w-0 flex-1",
  mobileTxnToolbarSearchIcon:
    "pointer-events-none absolute left-2 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground",
  mobileTxnToolbarSearchInput: "w-full min-w-0 pl-8 text-sm",

  /** Summary collapse FAB — fixed (report list, bina pager); z-40 = dialog overlay (z-50) ke neeche */
  summaryFab:
    "pointer-events-auto fixed right-3 z-40 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-lg backdrop-blur-md hover:bg-muted active:scale-95",
  /** Report list: action footer ke upar */
  summaryFabPosition:
    "bottom-[calc(env(safe-area-inset-bottom,0px)+3.25rem)]",
  /** Pagination row ke just upar — MobileTransactionsPager wrapper me absolute */
  summaryFabInline:
    "pointer-events-auto flex items-center justify-center rounded-full border border-blue-300 bg-blue-100 shadow-[0_1px_2px_rgba(15,23,42,0.06)] hover:bg-blue-200/80 active:scale-95",
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
  masterBackRow: "pl-mobile-entity-detail-header flex flex-shrink-0 items-center gap-1 border-b px-2 py-0.5",
  masterTitle: "shrink-0 text-sm font-bold",
  masterSelectionName: "min-w-0 truncate text-xs font-medium",
  masterAvatarSlot: "flex h-7 w-7 items-center justify-center border-l border-border p-px",
  /** Merged header avatar — photo add par bhi same square (stretch mat) */
  mobileHeaderAvatarBox: LEDGER_HEADER_AVATAR_BOX_CN,
  /** Photo ho — list dock search jaisa light blue border */
  mobileHeaderAvatarWithPhoto: "border-blue-300 bg-white",
  /** List dock chevron jaisa — merged header avatar jab photo na ho */
  mobileHeaderAvatarNoPhoto: "border-blue-500 bg-blue-100",
  mobileHeaderAvatarNoPhotoFallback: "bg-blue-100 text-blue-600 pl-mobile-header-avatar-fallback",

  /** AccountDetails report chrome (Contra/Journal mobile) */
  reportChromeHeader: "z-10 flex flex-shrink-0 flex-col gap-1 border-b bg-background px-2 py-1",
  reportChromeTitleRow: "flex min-w-0 items-center gap-1",
  reportChromeTitle: "shrink-0 text-sm font-bold text-muted-foreground",
  reportChromeEntity: "min-w-0 truncate text-xs font-medium",
  reportChromeBalance: "shrink-0 whitespace-nowrap text-xs font-bold",

  /** Report mobile: sirf txn table scroll — pager alag row (footer ke upar, hamesha dikhe). */
  reportTxnScrollBody: "flex-1 min-h-0 overflow-y-auto scroll-touch pl-ledger-txn-scroll-native",
  ledgerTxnScrollBody: "flex-1 min-h-0 overflow-auto scroll-touch pl-ledger-txn-scroll-native",
  /** Report register: pager scroll ke bahar — `ReportMobileLedgerFooter` fixed niche rehta hai */
  reportTxnPagerOutside:
    "flex-shrink-0 border-t bg-background/95 z-40 mb-[calc(env(safe-area-inset-bottom,0px)+3.25rem)]",
  /** @deprecated use reportTxnPagerOutside — pager ab scroll ke andar nahi */
  reportTxnPagerInScroll:
    "flex-shrink-0 border-t bg-background/95 z-40 mb-[calc(env(safe-area-inset-bottom,0px)+3.25rem)]",
  /** Pager + toolbar — fixed stack CSS (`globals.css` + action footer); no extra margin row. */
  ledgerTxnPagerOutside: "flex-shrink-0",
  /** Ledger txn scroll — bottom pad clears fixed pager + toolbar + action footer (globals). */
  mobileLedgerTxnScrollPad: "pl-mobile-ledger-txn-scroll-pad",
} as const;

/** Theme `.rounded-lg.border` black override se exclude — list dock chevron blue */
export const mdcMobileHeaderAvatarData = { "data-pl-mobile-header-avatar": "" } as const;
export const mdcMobileHeaderAvatarNoPhotoData = { "data-pl-mobile-header-avatar-no-photo": "" } as const;

export const mdcMobileTxnBalanceRowData = { "data-pl-mobile-txn-balance-row": "" } as const;
export const mdcMobileTxnDateRowData = { "data-pl-mobile-txn-date-row": "" } as const;
export const mdcMobileTxnToolbarRowData = { "data-pl-mobile-txn-toolbar-row": "" } as const;
export const mdcMobileTxnToolbarEditData = { "data-pl-mobile-txn-toolbar-edit": "" } as const;

/** Mobile list → detail: shell title (e.g. "Party details" + naam merged header). */
export function mobileEntityDetailShellTitle(
  isMobile: boolean,
  hasSelection: boolean,
  listTitle: string,
  entityDetailTitle: string
): string {
  if (isMobile && hasSelection) return entityDetailTitle;
  return listTitle;
}

/** Mobile txn list scroll wrapper — report vs ledger detail */
export function mobileTxnScrollBodyClass(isReportMobileChrome: boolean): string {
  return isReportMobileChrome
    ? mdc.reportTxnScrollBody
    : `${mdc.ledgerTxnScrollBody} ${mdc.mobileLedgerTxnScrollPad}`;
}
