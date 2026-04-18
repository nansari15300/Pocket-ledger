"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/** Sort field for transaction list (Statement / Bill wise / Spend wise). By Type removed from all views. */
export type TransactionSortBy =
  | "date"
  | "amount"
  | "voucherNo"
  | "settled"
  | "overdue"
  | "partial";
export type TransactionSortOrder = "asc" | "desc";

const ALL_SORT_OPTIONS: { value: TransactionSortBy; label: string }[] = [
  { value: "date", label: "By Date" },
  { value: "amount", label: "By Amount" },
  { value: "voucherNo", label: "By Voucher No." },
  { value: "settled", label: "By Settled" },
  { value: "overdue", label: "Overdue" },
  { value: "partial", label: "Partial" },
];

/** Statement & Spend wise: only date, amount, voucher no. Bill wise: also settled, overdue, partial. */
function getVisibleOptions(viewMode: "statement" | "bill_wise" | "spend_wise") {
  const baseOnly = ["date", "amount", "voucherNo"];
  if (viewMode === "statement" || viewMode === "spend_wise")
    return ALL_SORT_OPTIONS.filter((o) => baseOnly.includes(o.value));
  return ALL_SORT_OPTIONS;
}

export type TransactionTableSortDropdownProps = {
  sortBy: TransactionSortBy;
  sortOrder: TransactionSortOrder;
  onSortChange: (sortBy: TransactionSortBy, sortOrder: TransactionSortOrder) => void;
  /** View mode for label (Statement / Bill wise / Spend wise) */
  viewMode?: "statement" | "bill_wise" | "spend_wise";
  className?: string;
};

/** Footer sort dropdown: list options with ascending/descending arrow on the right of each. */
export function TransactionTableSortDropdown({
  sortBy,
  sortOrder,
  onSortChange,
  viewMode = "statement",
  className,
}: TransactionTableSortDropdownProps) {
  const visibleOptions = React.useMemo(() => getVisibleOptions(viewMode), [viewMode]);
  const currentLabel =
    visibleOptions.find((o) => o.value === sortBy)?.label ?? visibleOptions[0]?.label ?? "Sort";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={cn("h-8 gap-1 flex-shrink-0", className)}>
          <ArrowUpDown className="h-4 w-4 opacity-70" />
          <span className="whitespace-nowrap">{currentLabel}</span>
          <span className="text-muted-foreground">
            {sortOrder === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {visibleOptions.map((opt) => (
          <DropdownMenuItem
            key={opt.value}
            onSelect={(e) => e.preventDefault()}
            onClick={() => {
              // By Date is the global default action: oldest on top, newest at bottom.
              if (opt.value === "date") onSortChange("date", "asc");
            }}
            className="flex items-center justify-between gap-2 py-1.5"
          >
            <span className="flex flex-1 items-center gap-2 text-left">
              <span>{opt.label}</span>
            </span>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSortChange(opt.value, "asc");
                }}
                className={cn(
                  // Keep arrow icons readable even when parent item hover/focus changes text color.
                  "p-1 rounded hover:bg-muted text-foreground hover:text-foreground",
                  // Merge "Default" and ascending action into one box for By Date.
                  opt.value === "date" && "flex items-center gap-1 border border-green-300 bg-green-50 px-1.5 py-0 text-[10px] font-semibold text-green-700 hover:bg-green-100 hover:text-green-700",
                  sortBy === opt.value && sortOrder === "asc" && "bg-muted"
                )}
                aria-label={`${opt.label} ascending`}
              >
                {opt.value === "date" ? <span>Default</span> : null}
                <ArrowUp className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSortChange(opt.value, "desc");
                }}
                className={cn(
                  // Keep arrow icons readable even when parent item hover/focus changes text color.
                  "p-1 rounded hover:bg-muted text-foreground hover:text-foreground",
                  sortBy === opt.value && sortOrder === "desc" && "bg-muted"
                )}
                aria-label={`${opt.label} descending`}
              >
                <ArrowDown className="h-4 w-4" />
              </button>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
