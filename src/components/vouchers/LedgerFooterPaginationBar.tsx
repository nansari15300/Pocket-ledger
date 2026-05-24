"use client";

import { ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TransactionTableSortDropdown,
  type TransactionSortBy,
  type TransactionSortOrder,
} from "@/components/vouchers/TransactionTableSortDropdown";
import {
  LedgerFooterParentPill,
  LedgerFooterTextPill,
  ledgerFooterIconBtnCn,
  ledgerFooterPillBtnCn,
  ledgerFooterRowCn,
} from "@/components/vouchers/ledgerFooterChrome";
import { ROWS_PER_PAGE_OPTIONS_DEFAULT } from "@/lib/rowsPerPageSelect";
import { cn } from "@/lib/utils";

export type LedgerFooterPaginationBarProps = {
  sortBy: TransactionSortBy;
  sortOrder: TransactionSortOrder;
  onSortChange: (sortBy: TransactionSortBy, sortOrder: TransactionSortOrder) => void;
  viewMode?: "statement" | "bill_wise" | "spend_wise";
  currentPage: number;
  totalPages: number;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
  rowsPerPageSelectValue: string;
  onRowsPerPageChange: (value: string) => void;
  rowsPerPageOptions?: readonly number[];
  includeAllOption?: boolean;
  /** Left (xx) — is page se pehle kitne txn (tail paging) */
  beforeCount?: number;
  /** Right (xx) — is page ke baad kitne txn */
  afterCount?: number;
  totalCount: number;
  className?: string;
  /** Reconciling footer: sort alag center pill me — pagination-only mode */
  hideSort?: boolean;
  /** Reconciling footer: Trxn count alag pill me — parent ke andar mat dikhao */
  hideTotalCount?: boolean;
};

/**
 * PC footer pagination — ek parent pill; andar chhote child controls.
 * Tail paging: (before) << < [rows] > >> (after) Total Trxn N
 */
export function LedgerFooterPaginationBar({
  sortBy,
  sortOrder,
  onSortChange,
  viewMode = "statement",
  currentPage,
  totalPages,
  setCurrentPage,
  rowsPerPageSelectValue,
  onRowsPerPageChange,
  rowsPerPageOptions = ROWS_PER_PAGE_OPTIONS_DEFAULT,
  includeAllOption = true,
  beforeCount = 0,
  afterCount = 0,
  totalCount,
  className,
  hideSort = false,
  hideTotalCount = false,
}: LedgerFooterPaginationBarProps) {
  const options = rowsPerPageOptions as readonly number[];

  return (
    <div
      className={cn(
        ledgerFooterRowCn,
        "flex-shrink-0 justify-end overflow-x-auto scrollbar-slim-dim",
        !hideSort && "sm:ml-auto",
        className
      )}
    >
      {!hideSort ? (
        <TransactionTableSortDropdown
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSortChange={onSortChange}
          viewMode={viewMode}
          chromePill
          className={ledgerFooterPillBtnCn}
        />
      ) : null}
      <LedgerFooterParentPill>
        <LedgerFooterTextPill>({beforeCount})</LedgerFooterTextPill>
        <Button
          type="button"
          variant="chromePill"
          size="icon"
          className={ledgerFooterIconBtnCn}
          onClick={() => setCurrentPage(totalPages)}
          disabled={currentPage === totalPages}
          aria-label="Oldest page"
        >
          <ChevronsLeft className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="chromePill"
          size="icon"
          className={ledgerFooterIconBtnCn}
          onClick={() => setCurrentPage((p) => p + 1)}
          disabled={currentPage === totalPages}
          aria-label="Older page"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        {/* Rows/page — parent ke andar; black box/global border mat (data-pl-footer-rows-select) */}
        <Select value={rowsPerPageSelectValue} onValueChange={onRowsPerPageChange}>
          <SelectTrigger
            data-pl-footer-rows-select
            className="h-7 w-[52px] shrink-0 rounded-full border-0 bg-transparent px-1 text-sm font-medium tabular-nums shadow-none focus:ring-0 focus-visible:ring-0"
          >
            <SelectValue placeholder={rowsPerPageSelectValue} />
          </SelectTrigger>
          <SelectContent side="top">
            {options.map((pageSize) => (
              <SelectItem key={pageSize} value={`${pageSize}`}>
                {pageSize}
              </SelectItem>
            ))}
            {includeAllOption ? <SelectItem value="0">All</SelectItem> : null}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="chromePill"
          size="icon"
          className={ledgerFooterIconBtnCn}
          onClick={() => setCurrentPage((p) => p - 1)}
          disabled={currentPage === 1}
          aria-label="Newer page"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="chromePill"
          size="icon"
          className={ledgerFooterIconBtnCn}
          onClick={() => setCurrentPage(1)}
          disabled={currentPage === 1}
          aria-label="Newest page"
        >
          <ChevronsRight className="h-3.5 w-3.5" />
        </Button>
        <LedgerFooterTextPill>({afterCount})</LedgerFooterTextPill>
        {!hideTotalCount ? (
          <LedgerFooterTextPill>Total Trxn {totalCount}</LedgerFooterTextPill>
        ) : null}
      </LedgerFooterParentPill>
    </div>
  );
}
