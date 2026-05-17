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
import { LedgerFooterChromePill, LedgerFooterTextPill } from "@/components/vouchers/ledgerFooterChrome";
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
  totalCount: number;
  className?: string;
};

/** Sort + page label + nav + rows/page + total — har block alag chrome pill. */
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
  totalCount,
  className,
}: LedgerFooterPaginationBarProps) {
  const options = rowsPerPageOptions as readonly number[];

  return (
    <div
      className={cn(
        "flex flex-shrink-0 flex-nowrap items-center justify-end gap-1.5 overflow-x-auto scrollbar-slim-dim",
        className
      )}
    >
      <TransactionTableSortDropdown
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSortChange={onSortChange}
        viewMode={viewMode}
        chromePill
      />
      <LedgerFooterTextPill>
        Page {currentPage} of {totalPages}
      </LedgerFooterTextPill>
      <Button
        type="button"
        variant="chromePill"
        size="icon"
        className="h-8 w-8 shrink-0"
        onClick={() => setCurrentPage(totalPages)}
        disabled={currentPage === totalPages}
        aria-label="Oldest page"
      >
        <ChevronsLeft className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="chromePill"
        size="icon"
        className="h-8 w-8 shrink-0"
        onClick={() => setCurrentPage((p) => p + 1)}
        disabled={currentPage === totalPages}
        aria-label="Older page"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <LedgerFooterChromePill className="px-1">
        <Select value={rowsPerPageSelectValue} onValueChange={onRowsPerPageChange}>
          <SelectTrigger className="h-7 w-[64px] border-0 bg-transparent shadow-none focus:ring-0">
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
      </LedgerFooterChromePill>
      <Button
        type="button"
        variant="chromePill"
        size="icon"
        className="h-8 w-8 shrink-0"
        onClick={() => setCurrentPage((p) => p - 1)}
        disabled={currentPage === 1}
        aria-label="Newer page"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="chromePill"
        size="icon"
        className="h-8 w-8 shrink-0"
        onClick={() => setCurrentPage(1)}
        disabled={currentPage === 1}
        aria-label="Newest page"
      >
        <ChevronsRight className="h-4 w-4" />
      </Button>
      <LedgerFooterTextPill>Total Trxn {totalCount}</LedgerFooterTextPill>
    </div>
  );
}
