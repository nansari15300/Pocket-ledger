"use client";

import * as React from "react";
import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { differenceInDays } from "date-fns";
import { useDate } from "@/hooks/useDate";
import { useAnimationSettings } from "@/hooks/useAnimationSettings";
import { motion, AnimatePresence } from "framer-motion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertCircle, Filter, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, MoreVertical, Pencil, ChevronDown, Columns3, Printer, History, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCompany } from "@/hooks/useCompany";
import usePermissions from "@/hooks/usePermissions";
import { openPrintDirect } from "@/lib/printDirect";
import { toast } from "sonner";

export type OverdueColumnKey = "date" | "type" | "voucherNo" | "party" | "user" | "debit" | "credit" | "status" | "netBalance";
const OVERDUE_COLUMN_LABELS: Record<OverdueColumnKey, string> = {
  date: "Date",
  type: "Type",
  voucherNo: "Voucher No.",
  party: "Accounts",
  user: "User",
  debit: "Debit",
  credit: "Credit",
  status: "Status",
  netBalance: "Net Balance",
};
type OverdueVisibleColumns = Record<OverdueColumnKey, boolean>;
const DEFAULT_OVERDUE_VISIBLE: OverdueVisibleColumns = {
  date: true,
  type: true,
  voucherNo: true,
  party: true,
  user: true,
  debit: true,
  credit: true,
  status: true,
  netBalance: true,
};

export type OverdueTransactionRow = {
  id: string;
  type: string;
  date: any;
  voucherNumber: string;
  partyId: string;
  partyName: string;
  total: number;
  outstanding: number;
  debit: number;
  credit: number;
  dueDate?: any;
  isOverdue: boolean;
  paymentStatus: string;
  userId?: string;
  userName?: string;
  narration?: string;
};

const safeToDate = (date: any): Date | null => {
  if (!date) return null;
  if (date instanceof Date) return date;
  if (typeof date?.toDate === "function") return date.toDate();
  const parsed = new Date(date);
  return isNaN(parsed.getTime()) ? null : parsed;
};

function getOverdueDays(dueDate: any): number {
  const due = safeToDate(dueDate);
  if (!due) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueOnly = new Date(due);
  dueOnly.setHours(0, 0, 0, 0);
  if (today <= dueOnly) return 0;
  return differenceInDays(today, dueOnly);
}

const resolveUserName = (t: OverdueTransactionRow, userNames: Record<string, string>): string => {
  const mappedName = t.userId ? userNames[t.userId] : undefined;
  if (mappedName && mappedName !== "Unknown" && mappedName !== "N/A") return mappedName;
  if (t.userName && t.userName !== "Unknown" && t.userName !== "N/A") return t.userName;
  return t.userId || "—";
};

export function OverdueAccountView({
  overdueTransactions,
  onEditVoucher,
  onHistoryVoucher,
  onAddLink,
  userNames = {},
}: {
  overdueTransactions: OverdueTransactionRow[];
  onEditVoucher?: (row: OverdueTransactionRow) => void;
  onHistoryVoucher?: (row: OverdueTransactionRow) => void;
  onAddLink?: (row: OverdueTransactionRow) => void;
  userNames?: Record<string, string>;
}) {
  const { dateSystem, formatDate, formatDateBS, formatCurrency } = useDate();
  const { company } = useCompany();
  const { can } = usePermissions();
  const { settings: animationSettings } = useAnimationSettings();
  const isRowAnimationEnabled = animationSettings?.rows?.enabled === true;
  const rowAnimationDuration = isRowAnimationEnabled ? (animationSettings?.rows?.duration ?? 0) : 0;
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);
  const [showNarration, setShowNarration] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      return sessionStorage.getItem("showNarration") !== "false";
    } catch {
      return true;
    }
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const [visibleColumns, setVisibleColumns] = useState<OverdueVisibleColumns>(() => {
    if (typeof window === "undefined") return DEFAULT_OVERDUE_VISIBLE;
    try {
      const saved = sessionStorage.getItem("overdueVisibleColumns");
      if (saved) {
        const parsed = JSON.parse(saved) as OverdueVisibleColumns;
        return { ...DEFAULT_OVERDUE_VISIBLE, ...parsed };
      }
    } catch {}
    return DEFAULT_OVERDUE_VISIBLE;
  });

  const handleColumnVisibilityChange = (key: OverdueColumnKey, checked: boolean) => {
    setVisibleColumns((prev) => {
      const next = { ...prev, [key]: checked };
      sessionStorage.setItem("overdueVisibleColumns", JSON.stringify(next));
      return next;
    });
  };

  const handleShowNarrationChange = (checked: boolean) => {
    setShowNarration(checked);
    sessionStorage.setItem("showNarration", String(checked));
  };

  const filteredRows = useMemo(() => {
    let list = overdueTransactions;
    const typeVal = (filters.type || "").toLowerCase();
    if (typeVal === "sale" || typeVal === "purchase") {
      list = list.filter((t) => t.type === typeVal);
    }
    const voucherQ = (filters.voucherNumber || "").trim().toLowerCase();
    if (voucherQ) {
      list = list.filter((t) => (t.voucherNumber || "").toLowerCase().includes(voucherQ));
    }
    const partyQ = (filters.party || "").trim().toLowerCase();
    if (partyQ) {
      list = list.filter(
        (t) =>
          (t.partyName || "").toLowerCase().includes(partyQ) ||
          (t.partyId || "").toLowerCase().includes(partyQ)
      );
    }
    const userQ = (filters.user || "").trim().toLowerCase();
    if (userQ) {
      list = list.filter((t) => {
        const name = resolveUserName(t, userNames).toLowerCase();
        return name.includes(userQ) || (t.userId || "").toLowerCase().includes(userQ);
      });
    }
    return list;
  }, [overdueTransactions, filters, userNames]);

  const totalPages = rowsPerPage <= 0 ? 1 : Math.max(1, Math.ceil(filteredRows.length / rowsPerPage));
  const paginatedRows = useMemo(() => {
    if (rowsPerPage <= 0) return filteredRows;
    const start = (currentPage - 1) * rowsPerPage;
    return filteredRows.slice(start, start + rowsPerPage);
  }, [filteredRows, currentPage, rowsPerPage]);

  useEffect(() => {
    if (selectedId && !paginatedRows.some((t) => t.id === selectedId)) setSelectedId(null);
  }, [paginatedRows, selectedId]);

  const handleTableKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (paginatedRows.length === 0) return;
      const idx = paginatedRows.findIndex((t) => t.id === selectedId);
      const currentIndex = idx >= 0 ? idx : -1;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = Math.min(currentIndex + 1, paginatedRows.length - 1);
        setSelectedId(paginatedRows[next]?.id ?? null);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prev = Math.max(currentIndex - 1, 0);
        setSelectedId(paginatedRows[prev]?.id ?? null);
      } else if (e.key === "Enter" && selectedId) {
        e.preventDefault();
        const t = paginatedRows.find((x) => x.id === selectedId);
        if (t) onEditVoucher?.(t);
      }
    },
    [paginatedRows, selectedId, onEditVoucher]
  );

  const OVERDUE_HEADER_MIN_PX = {
    date: 95,
    type: 75,
    voucherNo: 105,
    party: 120,
    user: 85,
    debit: 100,
    credit: 100,
    status: 95,
    netBalance: 115,
  } as const;

  const renderHeaderWithFilter = (key: string, label: string, isNumeric: boolean = false, minWidthPx?: number) => {
    const isFiltered = !!(filters[key] ?? "").trim();
    return (
      <TableHead className={cn("p-0", isNumeric && "text-right")} style={minWidthPx != null ? { minWidth: `${minWidthPx}px` } : undefined}>
        <div className={cn("flex items-center gap-1 font-semibold px-2 py-2 whitespace-nowrap", isFiltered && "text-primary", isNumeric ? "justify-end" : "justify-start")}>
          <span>{label}</span>
          <Popover open={activeFilter === key} onOpenChange={(open) => setActiveFilter(open ? key : null)}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0">
                <Filter className={cn("h-4 w-4", isFiltered && "text-primary")} />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="p-2 w-48" align="start" onOpenAutoFocus={(e) => e.preventDefault()} onCloseAutoFocus={(e) => e.preventDefault()}>
              {key === "type" ? (
                <div className="space-y-1">
                  <Button variant={(!filters.type || filters.type === "all") ? "secondary" : "ghost"} size="sm" className="w-full justify-start" onClick={() => { setFilters((p) => ({ ...p, type: "" })); setActiveFilter(null); }}>All types</Button>
                  <Button variant={filters.type === "sale" ? "secondary" : "ghost"} size="sm" className="w-full justify-start" onClick={() => { setFilters((p) => ({ ...p, type: "sale" })); setActiveFilter(null); }}>Sale</Button>
                  <Button variant={filters.type === "purchase" ? "secondary" : "ghost"} size="sm" className="w-full justify-start" onClick={() => { setFilters((p) => ({ ...p, type: "purchase" })); setActiveFilter(null); }}>Purchase</Button>
                </div>
              ) : (
                <Input
                  placeholder={`Filter ${label}...`}
                  value={filters[key] ?? ""}
                  onChange={(e) => setFilters((p) => ({ ...p, [key]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter") setActiveFilter(null); }}
                  autoFocus
                />
              )}
            </PopoverContent>
          </Popover>
        </div>
      </TableHead>
    );
  };

  const totalDebit = filteredRows.reduce((s, t) => s + (t.debit || 0), 0);
  const totalCredit = filteredRows.reduce((s, t) => s + (t.credit || 0), 0);

  const runPrintDirect = async () => {
    if (!company) {
      toast.error("Company not loaded. Please try again.");
      return;
    }
    try {
      await openPrintDirect(
        {
          company: {
            name: company.name,
            pan: company.pan,
            phone: company.phone,
            address: company.address,
            decimalPlaces: company.decimalPlaces,
            showDrCr: company.showDrCr,
            showCurrencySymbol: company.showCurrencySymbol,
            logoUrl: company.logoUrl,
          },
          title: "Overdue Vouchers",
          context: "overdue",
          dateSystem: dateSystem === "BS" ? "BS" : dateSystem === "AD" ? "AD" : "Both",
          dateRangeText: "All overdue vouchers across parties",
          vouchersCount: filteredRows.length,
          openingBalance: 0,
          transactions: filteredRows,
          userNames,
          showNarration,
        },
        true
      );
    } catch (e) {
      console.error("Overdue print failed:", e);
      toast.error(e instanceof Error ? e.message : "Print failed. Please try again.");
    }
  };


  return (
    <div className="flex flex-col h-full min-h-0">
      <Card className="flex flex-col flex-1 min-h-0 border-0 shadow-none rounded-none">
        <CardHeader className="flex-shrink-0 pb-2">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
                <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-500" />
              </div>
              <div className="min-w-0">
                <CardTitle className="text-lg truncate">Overdue Vouchers</CardTitle>
                <CardDescription>
                  All overdue vouchers across parties
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className={cn("font-semibold", totalDebit - totalCredit >= 0 ? "text-green-600" : "text-red-600")}>
                {formatCurrency(totalDebit - totalCredit, { showDrCr: true })}
              </span>
              <Button variant="outline" size="icon" className="h-10 w-10 flex-shrink-0" onClick={() => runPrintDirect()} title="Print">
                <Printer className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 overflow-auto p-0">
          <div
            ref={tableContainerRef}
            tabIndex={0}
            role="grid"
            aria-label="Overdue vouchers"
            className="outline-none focus:outline-none min-h-0 overflow-x-auto scrollbar-slim-dim w-full min-w-0"
            onKeyDown={handleTableKeyDown}
            onClick={() => tableContainerRef.current?.focus()}
          >
          <Table className="table-auto w-full min-w-0">
            <TableHeader>
              <TableRow className="bg-muted/50">
                {visibleColumns.date && <TableHead className="font-semibold pl-3 pr-2 py-2 whitespace-nowrap" style={{ minWidth: OVERDUE_HEADER_MIN_PX.date }}>Date</TableHead>}
                {visibleColumns.type && renderHeaderWithFilter("type", "Type", false, OVERDUE_HEADER_MIN_PX.type)}
                {visibleColumns.voucherNo && renderHeaderWithFilter("voucherNumber", "Voucher No.", false, OVERDUE_HEADER_MIN_PX.voucherNo)}
                {visibleColumns.party && renderHeaderWithFilter("party", "Accounts", false, OVERDUE_HEADER_MIN_PX.party)}
                {visibleColumns.user && renderHeaderWithFilter("user", "User", false, OVERDUE_HEADER_MIN_PX.user)}
                {visibleColumns.debit && <TableHead className="text-right font-semibold px-2 py-2 whitespace-nowrap" style={{ minWidth: OVERDUE_HEADER_MIN_PX.debit }}>Debit</TableHead>}
                {visibleColumns.credit && <TableHead className="text-right font-semibold px-2 py-2 whitespace-nowrap" style={{ minWidth: OVERDUE_HEADER_MIN_PX.credit }}>Credit</TableHead>}
                {visibleColumns.status && <TableHead className="text-center font-semibold px-2 py-2 whitespace-nowrap" style={{ minWidth: OVERDUE_HEADER_MIN_PX.status }}>Status</TableHead>}
                {visibleColumns.netBalance && <TableHead className="text-right font-semibold px-2 py-2 whitespace-nowrap" style={{ minWidth: OVERDUE_HEADER_MIN_PX.netBalance }}>Net Balance</TableHead>}
                <TableHead className="w-10 min-w-10 p-1 pr-[5px] text-center font-semibold align-middle" />
              </TableRow>
            </TableHeader>
            <TableBody>
              <AnimatePresence>
              {paginatedRows.map((t) => {
                const d = safeToDate(t.date);
                const dateStr = d ? (dateSystem === "BS" ? formatDateBS(d) : formatDate(d)) : "—";
                const isCreditSide = t.type === "purchase";
                const balanceVal = isCreditSide ? -t.outstanding : t.outstanding;
                const displayUserName = resolveUserName(t, userNames);
                return (
                  <React.Fragment key={t.id}>
                  <motion.tr
                    layout
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{
                      duration: isRowAnimationEnabled ? rowAnimationDuration : 0,
                      ease: "easeInOut",
                    }}
                    className={cn(
                      "cursor-pointer min-h-[28px]",
                      showNarration ? "border-b-0" : "border-b",
                      selectedId === t.id &&
                        "[&>td]:bg-primary/10 [&>td]:border-t-2 [&>td]:border-primary [&>td:first-child]:rounded-l-full [&>td:first-child]:border-l-2 [&>td:first-child]:border-primary [&>td:first-child]:overflow-hidden [&>td:last-child]:rounded-r-full [&>td:last-child]:border-r-2 [&>td:last-child]:border-primary [&>td:last-child]:overflow-hidden",
                      selectedId === t.id && showNarration && "[&>td]:border-b-0",
                      showNarration && "[&>td]:pb-0.5"
                    )}
                    onClick={() => setSelectedId(t.id)}
                  >
                    {visibleColumns.date && <TableCell className="whitespace-nowrap pl-3 pr-2">{dateStr}</TableCell>}
                    {visibleColumns.type && (
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {t.type.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                    )}
                    {visibleColumns.voucherNo && <TableCell>{t.voucherNumber || "—"}</TableCell>}
                    {visibleColumns.party && <TableCell className="font-medium">{t.partyName || "—"}</TableCell>}
                    {visibleColumns.user && <TableCell className="text-muted-foreground">{displayUserName}</TableCell>}
                    {visibleColumns.debit && (
                      <TableCell className="text-right text-green-600">
                        {t.debit > 0 ? formatCurrency(t.debit, { noSuffix: true, context: "transaction" }) : "—"}
                      </TableCell>
                    )}
                    {visibleColumns.credit && (
                      <TableCell className="text-right text-red-600">
                        {t.credit > 0 ? formatCurrency(t.credit, { noSuffix: true, context: "transaction" }) : "—"}
                      </TableCell>
                    )}
                    {visibleColumns.status && (
                      <TableCell className="text-center align-middle">
                        <Badge variant="outline" className="text-red-600 border-red-600/50 inline-flex h-[22px] font-semibold shrink-0">
                          Overdue
                        </Badge>
                      </TableCell>
                    )}
                    {visibleColumns.netBalance && (
                      <TableCell className={cn("text-right font-semibold", balanceVal >= 0 ? "text-green-600" : "text-red-600")}>
                        {formatCurrency(Math.abs(balanceVal), { noSuffix: true, context: "transaction" })}{" "}
                        {balanceVal >= 0 ? "Dr" : "Cr"}
                      </TableCell>
                    )}
                    <TableCell
                      className="w-10 p-1 pr-[5px] text-center align-middle"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                            <MoreVertical className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          {can('view_voucher_history') && onHistoryVoucher && (
                            <DropdownMenuItem
                              onClick={() => onHistoryVoucher(t)}
                              className="flex items-center gap-2"
                            >
                              <History className="h-3.5 w-3.5" />
                              History
                            </DropdownMenuItem>
                          )}
                          {can('add_link') && onAddLink && (
                            <DropdownMenuItem
                              onClick={() => onAddLink(t)}
                              className="flex items-center gap-2"
                            >
                              <Link2 className="h-3.5 w-3.5" />
                              Add Link
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onClick={() => onEditVoucher?.(t)}
                            className="flex items-center gap-2"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Edit
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </motion.tr>
                  {showNarration && (() => {
                    const narrationColSpan =
                          (visibleColumns.date ? 1 : 0) +
                          (visibleColumns.type ? 1 : 0) +
                          (visibleColumns.voucherNo ? 1 : 0) +
                          (visibleColumns.party ? 1 : 0) +
                          (visibleColumns.user ? 1 : 0) +
                          (visibleColumns.debit ? 1 : 0) +
                          (visibleColumns.credit ? 1 : 0) +
                          (visibleColumns.status ? 0 : 1);
                    const overdueDays = getOverdueDays(t.dueDate);
                    const daysText = overdueDays > 0 ? `${overdueDays} ${overdueDays === 1 ? "day" : "days"}` : "";
                    return (
                    <tr
                      role="button"
                      tabIndex={-1}
                      onClick={() => setSelectedId(t.id)}
                      className={cn(
                        "narration-row border-b cursor-pointer -mt-1.5",
                        selectedId === t.id
                          ? "bg-primary/10 [&>td]:border-t-0 [&>td]:border-b-2 [&>td]:border-primary [&>td]:border-x-0 [&>td:first-child]:border-l-2 [&>td:first-child]:border-primary [&>td:last-child]:border-r-2 [&>td:last-child]:border-primary"
                          : "bg-muted/30 hover:bg-muted/40"
                      )}
                    >
                      <TableCell
                        colSpan={narrationColSpan}
                        className="pt-0.5 pb-0.5 px-3 text-[11px] italic text-muted-foreground leading-tight align-top whitespace-normal break-words min-w-0 max-w-full"
                      >
                        <span className="font-semibold not-italic">Narration:</span> {t.narration || "No narration"}
                      </TableCell>
                      {visibleColumns.status && (
                        <TableCell className="pt-0.5 pb-0.5 px-2 text-[10px] text-red-600 font-medium text-center leading-tight align-top whitespace-nowrap">
                          {daysText}
                        </TableCell>
                      )}
                      {visibleColumns.netBalance && <TableCell className="py-0 w-10 p-0" />}
                      <TableCell className="py-0 w-10 p-0" />
                    </tr>
                    );
                  })()}
                </React.Fragment>
                );
              })}
              </AnimatePresence>
            </TableBody>
            <TableFooter>
              <TableRow className="font-semibold">
                <TableCell
                  colSpan={
                    (visibleColumns.date ? 1 : 0) +
                    (visibleColumns.type ? 1 : 0) +
                    (visibleColumns.voucherNo ? 1 : 0) +
                    (visibleColumns.party ? 1 : 0) +
                    (visibleColumns.user ? 1 : 0)
                  }
                  className="pl-3 pr-2"
                >Total</TableCell>
                {visibleColumns.debit && (
                  <TableCell className="text-right text-green-600">
                    {formatCurrency(totalDebit, { noSuffix: true, context: "transaction" })}
                  </TableCell>
                )}
                {visibleColumns.credit && (
                  <TableCell className="text-right text-red-600">
                    {formatCurrency(totalCredit, { noSuffix: true, context: "transaction" })}
                  </TableCell>
                )}
                {visibleColumns.status && <TableCell />}
                {visibleColumns.netBalance && <TableCell />}
                <TableCell className="w-10 p-1 pr-[5px]" />
              </TableRow>
            </TableFooter>
          </Table>
          </div>
        </CardContent>
        {/* Footer: same layout as Party Details */}
        <div className="py-2 px-4 border-t overflow-auto min-h-0 scrollbar-slim-dim flex-shrink-0 mt-auto bg-background">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-y-2 min-w-max">
            <div className="flex items-center gap-2 sm:gap-4 flex-nowrap min-w-0 overflow-x-auto scrollbar-slim-dim text-sm text-muted-foreground">
              <span className="whitespace-nowrap flex-shrink-0">{filteredRows.length} voucher(s).</span>
              <div className="flex items-center space-x-2 flex-shrink-0">
                <Checkbox
                  id="show-narration-overdue"
                  checked={showNarration}
                  onCheckedChange={(checked: boolean) => handleShowNarrationChange(Boolean(checked))}
                />
                <label htmlFor="show-narration-overdue" className="text-sm font-medium leading-none whitespace-nowrap">Show Narration</label>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 gap-1 flex-shrink-0">
                    <Columns3 className="h-4 w-4" />
                    Columns
                    <ChevronDown className="h-4 w-4 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-52 p-2">
                  {(Object.keys(OVERDUE_COLUMN_LABELS) as OverdueColumnKey[]).map((key) => (
                    <DropdownMenuItem
                      key={key}
                      onSelect={(e) => e.preventDefault()}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <Checkbox
                        id={`overdue-col-${key}`}
                        checked={visibleColumns[key] !== false}
                        onCheckedChange={(c) => handleColumnVisibilityChange(key, Boolean(c))}
                      />
                      <label htmlFor={`overdue-col-${key}`} className="text-sm font-medium flex-1 cursor-pointer">
                        {OVERDUE_COLUMN_LABELS[key]}
                      </label>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="flex items-center gap-2 justify-end flex-nowrap overflow-x-auto scrollbar-slim-dim flex-shrink-0">
              <p className="text-sm font-medium flex-shrink-0">Rows per page</p>
              <Select
                value={`${rowsPerPage}`}
                onValueChange={(value) => {
                  setRowsPerPage(Number(value) || 0);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="h-8 w-[70px]">
                  <SelectValue placeholder={`${rowsPerPage}`} />
                </SelectTrigger>
                <SelectContent side="top">
                  {[10, 20, 30, 50].map((pageSize) => (
                    <SelectItem key={pageSize} value={`${pageSize}`}>{pageSize}</SelectItem>
                  ))}
                  <SelectItem value="0">All</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm font-medium flex-shrink-0">
                Page {currentPage} of {totalPages}
              </p>
              <div className="flex items-center space-x-1 flex-shrink-0">
                <Button
                  variant="outline"
                  className="h-8 w-8 p-0"
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                >
                  <ChevronsLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  className="h-8 w-8 p-0"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  className="h-8 w-8 p-0"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  className="h-8 w-8 p-0"
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                >
                  <ChevronsRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
