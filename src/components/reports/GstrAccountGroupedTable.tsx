"use client";

import { useCallback, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { ChevronsDownUp, ChevronsUpDown, ChevronDown, ChevronRight, Filter, X } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { GstrAccountGroup, GstrLineRow } from "@/lib/reports/gstrVoucherAmounts";
import {
  GSTR_TABLE_CLASS,
  GSTR_TABLE_TOTAL_ROW_CLASS,
  GstrSelectableTableRow,
  GstrVoucherTableRow,
} from "@/components/reports/GstrReportShell";
import { LEDGER_HEADER_PILL_CN, LEDGER_HEADER_PILL_ICON_SIZE_CN } from "@/lib/ledgerHeaderChrome";
import { txnTableIconBtnCn } from "@/lib/listSelectionChrome";
import {
  amountColumnHaystackMatchesFilter,
  columnFieldValuesHaystack,
  columnHaystackMatchesFilter,
} from "@/lib/transactionColumnHeaderFilter";
import { cn } from "@/lib/utils";

export function useGstrAccountExpand(groups: GstrAccountGroup[]) {
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set());
  const allKeys = useMemo(() => groups.map((g) => g.key), [groups]);

  const toggleAccount = useCallback((key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setExpandedKeys(new Set(allKeys));
  }, [allKeys]);

  const collapseAll = useCallback(() => {
    setExpandedKeys(new Set());
  }, []);

  const allExpanded = allKeys.length > 0 && allKeys.every((key) => expandedKeys.has(key));
  const noneExpanded = expandedKeys.size === 0;

  return { expandedKeys, toggleAccount, expandAll, collapseAll, allExpanded, noneExpanded };
}

export function GstrExpandCollapsePills({
  onExpandAll,
  onCollapseAll,
  allExpanded,
  noneExpanded,
  disabled,
}: {
  onExpandAll: () => void;
  onCollapseAll: () => void;
  allExpanded: boolean;
  noneExpanded: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant="outline"
        className={cn(LEDGER_HEADER_PILL_CN, "gap-1")}
        disabled={disabled || allExpanded}
        title="Expand all accounts"
        aria-label="Expand all accounts"
        onClick={onExpandAll}
      >
        <ChevronsUpDown className={LEDGER_HEADER_PILL_ICON_SIZE_CN} />
        Expand All
      </Button>
      <Button
        type="button"
        variant="outline"
        className={cn(LEDGER_HEADER_PILL_CN, "gap-1")}
        disabled={disabled || noneExpanded}
        title="Collapse all accounts"
        aria-label="Collapse all accounts"
        onClick={onCollapseAll}
      >
        <ChevronsDownUp className={LEDGER_HEADER_PILL_ICON_SIZE_CN} />
        Collapse All
      </Button>
    </div>
  );
}

type GstrIdLabel = "GSTIN" | "PAN No.";

function GstrFilterableHead({
  filterKey,
  label,
  numeric,
  filters,
  setFilters,
  activeFilter,
  setActiveFilter,
  leading,
}: {
  filterKey: string;
  label: string;
  numeric?: boolean;
  filters: Record<string, string>;
  setFilters: Dispatch<SetStateAction<Record<string, string>>>;
  activeFilter: string | null;
  setActiveFilter: (key: string | null) => void;
  leading?: ReactNode;
}) {
  const filterValue = filters[filterKey] || "";
  const isFiltered = Boolean(filterValue.trim());
  const filterOpen = activeFilter === filterKey;
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <TableHead className={cn("p-0", numeric && "text-right")}>
      <div
        className={cn(
          "flex items-center gap-0.5 whitespace-nowrap px-2 py-2 font-medium",
          numeric ? "justify-end" : "justify-start",
          isFiltered ? "text-red-600" : "text-muted-foreground"
        )}
      >
        {leading}
        <span>{label}</span>
        <Popover modal open={filterOpen} onOpenChange={(open) => setActiveFilter(open ? filterKey : null)}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              data-pl-txn-icon-btn=""
              className={cn(txnTableIconBtnCn, "h-6 w-6", numeric ? "ml-1" : "ml-0")}
              aria-label={`Filter ${label}`}
            >
              <Filter className={cn("h-4 w-4", isFiltered && "text-red-600")} />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            side="top"
            align="center"
            sideOffset={6}
            className="z-[120] w-48 overflow-hidden p-0"
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              requestAnimationFrame(() => inputRef.current?.focus());
            }}
            onCloseAutoFocus={(e) => e.preventDefault()}
            onPointerDownOutside={(e) => {
              const target = e.target as HTMLElement | null;
              if (target?.closest("[data-pl-txn-filter-popover]")) e.preventDefault();
            }}
          >
            <div className="relative" data-pl-txn-filter-popover="">
              <Input
                ref={inputRef}
                className={cn("border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0", filterValue && "pr-9")}
                placeholder={`Filter ${label}...`}
                value={filterValue}
                onChange={(e) => {
                  const newValue = e.target.value;
                  setFilters((prev) => ({ ...prev, [filterKey]: newValue }));
                }}
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setActiveFilter(null);
                }}
              />
              {filterValue ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 rounded-full text-muted-foreground hover:text-foreground"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setFilters((prev) => ({ ...prev, [filterKey]: "" }));
                    requestAnimationFrame(() => inputRef.current?.focus());
                  }}
                  aria-label={`Clear ${label} filter`}
                >
                  <X className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </TableHead>
  );
}

function gstrRowMatchesFilters(
  row: GstrLineRow,
  filters: Record<string, string>,
  displayDate: (date: unknown) => string
): boolean {
  const entries = Object.entries(filters).filter(([, v]) => String(v || "").trim());
  if (entries.length === 0) return true;
  for (const [key, raw] of entries) {
    const q = String(raw).trim();
    if (key === "date") {
      if (!columnHaystackMatchesFilter(displayDate(row.date), q)) return false;
      continue;
    }
    if (key === "voucherNumber") {
      if (!columnHaystackMatchesFilter(String(row.voucherNumber || ""), q)) return false;
      continue;
    }
    if (key === "partyName") {
      if (!columnHaystackMatchesFilter(row.partyName, q)) return false;
      continue;
    }
    if (key === "gstin") {
      if (!columnHaystackMatchesFilter(row.partyGSTIN, q)) return false;
      continue;
    }
    if (key === "taxableAmount") {
      if (!amountColumnHaystackMatchesFilter(columnFieldValuesHaystack([row.taxableAmount]), q)) return false;
      continue;
    }
    if (key === "taxAmount") {
      if (!amountColumnHaystackMatchesFilter(columnFieldValuesHaystack([row.taxAmount]), q)) return false;
      continue;
    }
    if (key === "totalAmount") {
      if (!amountColumnHaystackMatchesFilter(columnFieldValuesHaystack([row.totalAmount]), q)) return false;
      continue;
    }
  }
  return true;
}

export function GstrAccountGroupedTable({
  groups,
  amountClass,
  money,
  displayDate,
  selectedRowId,
  onSelect,
  onEdit,
  emptyMessage,
  totals: _totals,
  expandedKeys,
  onToggleAccount,
}: {
  groups: GstrAccountGroup[];
  amountClass: string;
  money: (amount: number) => ReactNode;
  displayDate: (date: unknown) => string;
  selectedRowId: string | null;
  onSelect: (id: string) => void;
  onEdit: (voucher: unknown) => void;
  emptyMessage: string;
  totals: { taxableAmount: number; taxAmount: number; totalAmount: number };
  expandedKeys: Set<string>;
  onToggleAccount: (key: string) => void;
}) {
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [idLabel, setIdLabel] = useState<GstrIdLabel>("GSTIN");

  const filteredGroups = useMemo(() => {
    return groups
      .map((group) => {
        const rows = group.rows.filter((row) => gstrRowMatchesFilters(row, filters, displayDate));
        const taxableAmount = rows.reduce((sum, row) => sum + row.taxableAmount, 0);
        const taxAmount = rows.reduce((sum, row) => sum + row.taxAmount, 0);
        const totalAmount = rows.reduce((sum, row) => sum + row.totalAmount, 0);
        return { ...group, rows, taxableAmount, taxAmount, totalAmount };
      })
      .filter((group) => group.rows.length > 0);
  }, [groups, filters, displayDate]);

  const filteredTotals = useMemo(
    () =>
      filteredGroups.reduce(
        (acc, group) => ({
          taxableAmount: acc.taxableAmount + group.taxableAmount,
          taxAmount: acc.taxAmount + group.taxAmount,
          totalAmount: acc.totalAmount + group.totalAmount,
        }),
        { taxableAmount: 0, taxAmount: 0, totalAmount: 0 }
      ),
    [filteredGroups]
  );

  const headProps = {
    filters,
    setFilters,
    activeFilter,
    setActiveFilter,
  };

  return (
    <Table scrollContainer={false} className={GSTR_TABLE_CLASS}>
      <TableHeader className="sticky top-0 z-10 bg-card">
        <TableRow>
          <GstrFilterableHead filterKey="date" label="Date" {...headProps} />
          <GstrFilterableHead filterKey="voucherNumber" label="Voucher No." {...headProps} />
          <GstrFilterableHead filterKey="partyName" label="Party Name" {...headProps} />
          <GstrFilterableHead
            filterKey="gstin"
            label={idLabel}
            leading={
              <button
                type="button"
                className={cn(txnTableIconBtnCn, "flex h-6 w-6 shrink-0 items-center justify-center")}
                title="Switch GSTIN / PAN No."
                aria-label="Switch GSTIN / PAN No."
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIdLabel((prev) => (prev === "GSTIN" ? "PAN No." : "GSTIN"));
                }}
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            }
            {...headProps}
          />
          <GstrFilterableHead filterKey="taxableAmount" label="Taxable Amount" numeric {...headProps} />
          <GstrFilterableHead filterKey="taxAmount" label="Tax Amount" numeric {...headProps} />
          <GstrFilterableHead filterKey="totalAmount" label="Total Amount" numeric {...headProps} />
        </TableRow>
      </TableHeader>
      <TableBody>
        {filteredGroups.map((group) => {
          const expanded = expandedKeys.has(group.key);
          const accountRowId = `acct:${group.key}`;
          return (
            <GstrAccountGroupRows
              key={group.key}
              group={group}
              expanded={expanded}
              accountRowId={accountRowId}
              amountClass={amountClass}
              money={money}
              displayDate={displayDate}
              selectedRowId={selectedRowId}
              onSelect={onSelect}
              onEdit={onEdit}
              onToggle={() => onToggleAccount(group.key)}
            />
          );
        })}
        {filteredGroups.length === 0 && (
          <TableRow className="!border-b-[1px] border-border hover:bg-transparent">
            <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
              {emptyMessage}
            </TableCell>
          </TableRow>
        )}
        {filteredGroups.length > 0 ? (
          <TableRow className={cn(GSTR_TABLE_TOTAL_ROW_CLASS, "hover:bg-muted/95 cursor-default")}>
            <TableCell colSpan={4}>TOTAL</TableCell>
            <TableCell className={amountClass}>{money(filteredTotals.taxableAmount)}</TableCell>
            <TableCell className={amountClass}>{money(filteredTotals.taxAmount)}</TableCell>
            <TableCell className={amountClass}>{money(filteredTotals.totalAmount)}</TableCell>
          </TableRow>
        ) : null}
      </TableBody>
    </Table>
  );
}

function GstrAccountGroupRows({
  group,
  expanded,
  accountRowId,
  amountClass,
  money,
  displayDate,
  selectedRowId,
  onSelect,
  onEdit,
  onToggle,
}: {
  group: GstrAccountGroup;
  expanded: boolean;
  accountRowId: string;
  amountClass: string;
  money: (amount: number) => ReactNode;
  displayDate: (date: unknown) => string;
  selectedRowId: string | null;
  onSelect: (id: string) => void;
  onEdit: (voucher: unknown) => void;
  onToggle: () => void;
}) {
  return (
    <>
      <GstrSelectableTableRow
        rowId={accountRowId}
        selectedRowId={selectedRowId}
        onSelect={onSelect}
        onDoubleClick={onToggle}
      >
        <TableCell />
        <TableCell />
        <TableCell className="font-semibold">
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground"
              aria-expanded={expanded}
              aria-label={expanded ? `Collapse ${group.partyName}` : `Expand ${group.partyName}`}
              onClick={(e) => {
                e.stopPropagation();
                onToggle();
              }}
            >
              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
            <span>{group.partyName}</span>
          </div>
        </TableCell>
        {expanded ? (
          <>
            <TableCell />
            <TableCell />
            <TableCell />
            <TableCell />
          </>
        ) : (
          <>
            <TableCell>{group.partyGSTIN}</TableCell>
            <TableCell className={amountClass}>{money(group.taxableAmount)}</TableCell>
            <TableCell className={amountClass}>{money(group.taxAmount)}</TableCell>
            <TableCell className={amountClass}>{money(group.totalAmount)}</TableCell>
          </>
        )}
      </GstrSelectableTableRow>
      {expanded
        ? group.rows.map((row) => (
            <GstrVoucherTableRow
              key={row.id}
              voucherId={row.id}
              voucher={row.voucher}
              selectedVoucherId={selectedRowId}
              onSelect={onSelect}
              onEdit={onEdit}
            >
              <TableCell>{displayDate(row.date)}</TableCell>
              <TableCell>{row.voucherNumber}</TableCell>
              <TableCell />
              <TableCell>{row.partyGSTIN}</TableCell>
              <TableCell className={amountClass}>{money(row.taxableAmount)}</TableCell>
              <TableCell className={amountClass}>{money(row.taxAmount)}</TableCell>
              <TableCell className={amountClass}>{money(row.totalAmount)}</TableCell>
            </GstrVoucherTableRow>
          ))
        : null}
    </>
  );
}