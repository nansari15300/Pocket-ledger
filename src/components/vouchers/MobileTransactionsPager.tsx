"use client";

import * as React from "react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { mdcNoEdgeSwipeCapture } from "@/lib/mobileDetailChrome";
import { useMobileDetailSummaryCollapsed } from "@/contexts/MobileDetailSummaryCollapseContext";
import { MobileDetailSummaryFloatingToggle } from "@/components/layout/MobileDetailSummaryFloatingToggle";
import { ROWS_PER_PAGE_OPTIONS_MOBILE } from "@/lib/rowsPerPageSelect";

type Props = {
  currentPage: number;
  totalItems: number;
  rowsPerPage: number;
  onPageChange: (nextPage: number) => void;
  onRowsPerPageChange: (nextRowsPerPage: number) => void;
  className?: string;
  /** `before` / `after` = txn count beside Prev / Next; enable jab count > 0. */
  edgeCounts?: { before: number; after: number };
  /** Party ledger: page 1 = latest (tail). Notes list: page 1 = oldest (head). */
  pagingMode?: "newest-first" | "oldest-first";
  /** Bank statement: "Showing / Trxn Of total" line hata — sirf page-size select + Prev/Next (count clutter avoid). */
  trimSummary?: boolean;
  /** Dashboard Recent: no "All" — max page size only. */
  includeAllOption?: boolean;
  /** Popup ledger: summary toggle ko us popup ke overlay ke upar bhi dikhaye. */
  showSummaryToggleInOverlay?: boolean;
};

const PAGE_SIZE_OPTIONS = ROWS_PER_PAGE_OPTIONS_MOBILE;

/** 30px pager row ke andar — thoda bada label, height na badhe */
const PAGER_NAV_BTN_CLASS =
  "h-5 min-h-0 shrink-0 px-2 py-0 text-xs leading-none font-bold bg-blue-600 hover:bg-blue-700 text-white disabled:bg-gray-200 disabled:text-gray-500";
const PAGER_NEXT_BTN_CLASS =
  "h-5 min-h-0 shrink-0 px-2 py-0 text-xs leading-none font-bold bg-green-600 hover:bg-green-700 text-white disabled:bg-gray-200 disabled:text-gray-500";

export function MobileTransactionsPager({
  currentPage,
  totalItems,
  rowsPerPage,
  onPageChange,
  onRowsPerPageChange,
  className,
  edgeCounts,
  trimSummary = false,
  showSummaryToggleInOverlay = false,
  pagingMode = "newest-first",
  includeAllOption = true,
}: Props) {
  const isMobile = useIsMobile();
  const { registerPagerFabHost, unregisterPagerFabHost } = useMobileDetailSummaryCollapsed();
  const totalPages = Math.max(1, rowsPerPage > 0 ? Math.ceil(totalItems / rowsPerPage) : 1);
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const useEdgePoolNav = edgeCounts != null && rowsPerPage > 0;
  const isNewestFirst = pagingMode === "newest-first";
  // Enable/disable: jis side count > 0, us button active (user expectation).
  const prevDisabled = useEdgePoolNav ? edgeCounts.before <= 0 : safePage <= 1;
  const nextDisabled = useEdgePoolNav ? edgeCounts.after <= 0 : safePage >= totalPages;
  const goPrevPage = () => {
    if (!useEdgePoolNav) {
      onPageChange(Math.max(1, safePage - 1));
      return;
    }
    // newest-first: Prev → purane (page+1); oldest-first: Prev → pehle pages (page−1)
    onPageChange(
      isNewestFirst ? Math.min(totalPages, safePage + 1) : Math.max(1, safePage - 1)
    );
  };
  const goNextPage = () => {
    if (!useEdgePoolNav) {
      onPageChange(Math.min(totalPages, safePage + 1));
      return;
    }
    onPageChange(
      isNewestFirst ? Math.max(1, safePage - 1) : Math.min(totalPages, safePage + 1)
    );
  };

  useEffect(() => {
    if (!isMobile) return;
    registerPagerFabHost();
    return () => unregisterPagerFabHost();
  }, [isMobile, registerPagerFabHost, unregisterPagerFabHost]);

  return (
    <div className={cn("pl-mobile-txn-pager-host relative flex-shrink-0", className)}>
      {/* Summary FAB — pagination bar ke bilkul upar, right side */}
      {isMobile ? (
        <div
          className="pointer-events-none absolute bottom-full left-1/2 z-40 mb-1 flex -translate-x-1/2 justify-center"
          {...mdcNoEdgeSwipeCapture}
        >
          <div className="pointer-events-auto">
            <MobileDetailSummaryFloatingToggle
              placement="inline"
              allowInOverlay={showSummaryToggleInOverlay}
            />
          </div>
        </div>
      ) : null}
      <div
        className="pl-mobile-txn-pager box-border flex h-[30px] min-h-[30px] max-h-[30px] items-center border-t border-blue-300/60 bg-blue-100/80 px-2 py-0 font-bold"
        data-pl-mobile-txn-pager=""
      >
        <div className="min-h-0 w-full overflow-x-auto">
          <div className="flex h-[30px] w-max min-w-full items-center justify-between gap-1.5">
            <div className="flex min-w-0 items-center gap-1">
              <Button
                type="button"
                variant="default"
                size="sm"
                className={PAGER_NAV_BTN_CLASS}
                onClick={goPrevPage}
                disabled={prevDisabled}
              >
                Prev
              </Button>
              {edgeCounts != null && rowsPerPage > 0 ? (
                <span
                  className="min-w-[1.25rem] shrink-0 text-center text-[10px] font-bold tabular-nums text-muted-foreground"
                  title="Transactions available via Prev"
                  aria-label={`${edgeCounts.before} transactions via Prev`}
                >
                  {edgeCounts.before}
                </span>
              ) : null}
            </div>
            <div
              className={cn(
                "flex shrink-0 items-center gap-1 text-[10px] font-bold",
                trimSummary && "flex-1 justify-center min-w-0"
              )}
            >
              {!trimSummary ? (
                <span className="whitespace-nowrap text-muted-foreground">Showing</span>
              ) : null}
              <Select
                value={String(rowsPerPage)}
                onValueChange={(value) => onRowsPerPageChange(Number(value) || 0)}
              >
                <SelectTrigger
                  data-pl-mobile-txn-pager-select=""
                  className="pl-mobile-txn-pager-select h-[22px] w-[70px] shrink-0 border border-blue-300 bg-white px-2 text-[10px] font-bold shadow-sm"
                  aria-label="Rows per page"
                  title="Rows per page"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <SelectItem key={size} value={String(size)}>
                      {size}
                    </SelectItem>
                  ))}
                  {includeAllOption ? <SelectItem value="0">All</SelectItem> : null}
                </SelectContent>
              </Select>
              {!trimSummary ? (
                <span className="whitespace-nowrap text-muted-foreground">
                  Trxn Of <span className="tabular-nums">{totalItems}</span>
                </span>
              ) : null}
            </div>
            <div className="flex min-w-0 items-center gap-1">
              {edgeCounts != null && rowsPerPage > 0 ? (
                <span
                  className="min-w-[1.25rem] shrink-0 text-center text-[10px] font-bold tabular-nums text-muted-foreground"
                  title="Transactions available via Next"
                  aria-label={`${edgeCounts.after} transactions via Next`}
                >
                  {edgeCounts.after}
                </span>
              ) : null}
              <Button
                type="button"
                variant="default"
                size="sm"
                className={PAGER_NEXT_BTN_CLASS}
                onClick={goNextPage}
                disabled={nextDisabled}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
