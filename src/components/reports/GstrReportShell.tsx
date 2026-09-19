"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Printer, X } from "lucide-react";
import { endOfDay, format, startOfDay } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { asCalendarRange, type DateRange } from "@/components/ui/ad-calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { Calendar as CalendarIcon } from "lucide-react";
import BsDatePicker from "@/components/ui/BsDatePicker";
import { useDate } from "@/hooks/useDate";
import { useCompany } from "@/hooks/useCompany";
import { getFiscalRangeForCountry } from "@/lib/fiscalRange";
import { LEDGER_HEADER_PILL_CN, LEDGER_HEADER_PILL_ICON_SIZE_CN } from "@/lib/ledgerHeaderChrome";
import { txnSelectedMainRowCn } from "@/lib/listSelectionChrome";
import { AddVoucherDialog } from "@/components/vouchers/AddVoucherDialog";

/** GSTR tables — 1px grid lines (override ui/table 3px defaults). */
export const GSTR_TABLE_CLASS =
  "[&_tr]:!border-b-[1px] [&_tr]:!border-t-0 [&_tr]:border-border [&_thead_tr]:!border-b-[1px] [&_thead_tr]:border-border";
export const GSTR_TABLE_DATA_ROW_CLASS =
  "!border-b-[1px] !border-t-0 border-border cursor-pointer";
export const GSTR_TABLE_TOTAL_ROW_CLASS =
  "sticky bottom-0 z-10 !border-b-0 !border-t-[1px] border-border bg-muted/95 font-bold shadow-[0_-1px_0_0_hsl(var(--border))]";
/** Party/sale (Dr) amounts — green. */
export const GSTR_AMOUNT_DR_CN = "text-right tabular-nums text-green-600";
/** Party/purchase (Cr) amounts — red. */
export const GSTR_AMOUNT_CR_CN = "text-right tabular-nums text-red-600";
export function gstrAmountClass(side: "dr" | "cr") {
  return side === "dr" ? GSTR_AMOUNT_DR_CN : GSTR_AMOUNT_CR_CN;
}

/** `formatCurrency` Dr/Cr follows sign — Cr rows must pass a negative amount. */
export function gstrMoneyAmount(amount: number, side: "dr" | "cr", showDrCr: boolean): number {
  const abs = Math.abs(Number(amount) || 0);
  return showDrCr ? (side === "cr" ? -abs : abs) : abs;
}

/** 0 on a Cr row would otherwise print as Dr (`amount >= 0`). Keep suffix Cr. */
export function gstrFormatCurrency(
  formatCurrency: (amount: number, options?: { noSuffix?: boolean }) => ReactNode,
  amount: number,
  side: "dr" | "cr",
  showDrCr: boolean
): ReactNode {
  const abs = Math.abs(Number(amount) || 0);
  if (showDrCr && side === "cr" && abs === 0) {
    return (
      <>
        {formatCurrency(0, { noSuffix: true })} Cr
      </>
    );
  }
  return formatCurrency(gstrMoneyAmount(amount, side, showDrCr));
}

const GSTR_DATE_PILL_CN = cn("w-auto", LEDGER_HEADER_PILL_CN);

function gstrEmptyRangeLabel(bothMode: boolean, calendar: "BS" | "AD" | "single"): string {
  if (bothMode && calendar !== "single") return `${calendar} · All`;
  return "All";
}

function formatGstrSpanText(from: Date, to: Date | undefined, formatFn: (d: Date) => string): string {
  const fromText = formatFn(from);
  const toText = to ? formatFn(to) : fromText;
  return toText && toText !== fromText ? `${fromText} - ${toText}` : fromText;
}

function gstrAllPillLabel(
  allTimeRange: DateRange | undefined,
  bothMode: boolean,
  calendar: "BS" | "AD" | "single",
  formatFn: (d: Date) => string
): string {
  const prefix = gstrEmptyRangeLabel(bothMode, calendar);
  if (!allTimeRange?.from) return prefix;
  return `${prefix} · ${formatGstrSpanText(allTimeRange.from, allTimeRange.to, formatFn)}`;
}

function formatGstrAdRangeLabel(
  dateRange: DateRange | undefined,
  bothMode: boolean,
  allTimeRange?: DateRange
): ReactNode {
  if (!dateRange?.from) {
    return (
      <span>
        {gstrAllPillLabel(allTimeRange, bothMode, bothMode ? "AD" : "single", (d) => format(d, "LLL dd, y"))}
      </span>
    );
  }
  const adText = dateRange.to ? (
    <>
      {format(dateRange.from, "LLL dd, y")} - {format(dateRange.to, "LLL dd, y")}
    </>
  ) : (
    format(dateRange.from, "LLL dd, y")
  );
  return bothMode ? <>AD · {adText}</> : adText;
}

/** Company pe FY start saved hai ya nahi (Timestamp / Date / ISO). */
function companyFiscalYearStartDate(company: { fiscalYearStart?: unknown } | null | undefined): Date | null {
  const raw = company?.fiscalYearStart;
  if (raw == null || raw === "") return null;
  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;
  if (typeof raw === "object" && typeof (raw as { toDate?: () => Date }).toDate === "function") {
    const d = (raw as { toDate: () => Date }).toDate();
    return d instanceof Date && !isNaN(d.getTime()) ? d : null;
  }
  const d = new Date(raw as string | number);
  return d instanceof Date && !isNaN(d.getTime()) ? d : null;
}

/** Default = All when FY not set; running FY range when company fiscal year is set. Clear (X) = All. */
export function useGstrReportDateRange() {
  const { company } = useCompany();
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  useEffect(() => {
    if (!companyFiscalYearStartDate(company)) {
      setDateRange(undefined);
      return;
    }
    const { start, end } = getFiscalRangeForCountry(company?.country || "Nepal");
    setDateRange({ from: startOfDay(start), to: endOfDay(end) });
  }, [company?.country, company?.fiscalYearStart]);

  const clearDateRange = useCallback(() => setDateRange(undefined), []);

  const hasDateFilter = Boolean(dateRange?.from);

  return { dateRange, setDateRange, clearDateRange, hasDateFilter };
}

type GstrReportShellProps = {
  title: string;
  description: string;
  dateControls: ReactNode;
  headerActions?: ReactNode;
  onPrint?: () => void;
  children: ReactNode;
};

export function GstrDateRangeControls({
  dateRange,
  setDateRange,
  onClear,
  dateSystem,
  calendarMonths,
  allTimeRange,
}: {
  dateRange: DateRange | undefined;
  setDateRange: (range: DateRange | undefined) => void;
  onClear?: () => void;
  dateSystem: string;
  calendarMonths: number;
  /** Unfiltered voucher span — shown on the pill when filter is All. */
  allTimeRange?: DateRange;
}) {
  const { formatDateBS } = useDate();
  const isBoth = dateSystem === "Both";
  const hasDateFilter = Boolean(dateRange?.from);
  const bsEmptyLabel = gstrAllPillLabel(allTimeRange, isBoth, isBoth ? "BS" : "single", formatDateBS);

  const bsRangeLabel = useMemo(() => {
    if (!dateRange?.from) {
      return gstrAllPillLabel(allTimeRange, isBoth, isBoth ? "BS" : "single", formatDateBS);
    }
    const fromBS = formatDateBS(dateRange.from);
    const toBS = dateRange.to ? formatDateBS(dateRange.to) : "";
    const rangeText = toBS && toBS !== fromBS ? `${fromBS} - ${toBS}` : fromBS;
    return isBoth ? `BS · ${rangeText}` : rangeText;
  }, [dateRange, allTimeRange, formatDateBS, isBoth]);

  const handleClear = () => {
    if (onClear) onClear();
    else setDateRange(undefined);
  };

  return (
    <div className="flex flex-wrap items-center gap-[3px]">
      <span className="mr-1 shrink-0 text-xs font-medium text-muted-foreground whitespace-nowrap">
        Fiscal Year
      </span>
      {(dateSystem === "BS" || dateSystem === "Both") && (
        <BsDatePicker
          isRange
          valueAD={dateRange}
          onChangeAD={(range) => setDateRange(range as DateRange)}
          className={GSTR_DATE_PILL_CN}
          rangeEmptyLabel={bsEmptyLabel}
        >
          {bsRangeLabel ?? undefined}
        </BsDatePicker>
      )}
      {(dateSystem === "AD" || dateSystem === "Both") && (
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "justify-start text-left font-normal",
                GSTR_DATE_PILL_CN,
                !hasDateFilter && "text-muted-foreground"
              )}
              data-theme-detail="date-range"
            >
              <CalendarIcon className={cn("mr-1.5 shrink-0", LEDGER_HEADER_PILL_ICON_SIZE_CN)} />
              {formatGstrAdRangeLabel(dateRange, isBoth, allTimeRange)}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              initialFocus
              mode="range"
              defaultMonth={dateRange?.from}
              selected={asCalendarRange(dateRange)}
              onSelect={setDateRange}
              numberOfMonths={calendarMonths}
            />
          </PopoverContent>
        </Popover>
      )}
      {hasDateFilter ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-[27px] w-[27px] shrink-0"
          title="Clear date filter (show all)"
          aria-label="Clear date filter"
          onClick={handleClear}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      ) : null}
    </div>
  );
}

export function useGstrVoucherEditDialog() {
  const [selectedVoucherId, setSelectedVoucherId] = useState<string | null>(null);
  const [editVoucher, setEditVoucher] = useState<any>(null);
  const [isVoucherDialogOpen, setIsVoucherDialogOpen] = useState(false);

  const selectVoucher = useCallback((id: string) => {
    setSelectedVoucherId(id);
  }, []);

  const openVoucherEdit = useCallback((voucher: any) => {
    setEditVoucher(voucher);
    setIsVoucherDialogOpen(true);
  }, []);

  const closeVoucherEdit = useCallback(() => {
    setEditVoucher(null);
    setIsVoucherDialogOpen(false);
  }, []);

  return {
    selectedVoucherId,
    selectVoucher,
    openVoucherEdit,
    editVoucher,
    isVoucherDialogOpen,
    setIsVoucherDialogOpen,
    closeVoucherEdit,
  };
}

export function GstrVoucherEditDialog({
  isOpen,
  onOpenChange,
  voucher,
  onClosed,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  voucher: any;
  onClosed: () => void;
}) {
  return (
    <AddVoucherDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      voucher={voucher}
      onVoucherCreated={onClosed}
    />
  );
}

export function GstrSelectableTableRow({
  rowId,
  selectedRowId,
  onSelect,
  onDoubleClick,
  children,
}: {
  rowId: string;
  selectedRowId: string | null;
  onSelect: (id: string) => void;
  onDoubleClick?: () => void;
  children: ReactNode;
}) {
  const isSelected = selectedRowId === rowId;
  return (
    <TableRow
      data-pl-gstr-data-row=""
      className={cn(
        GSTR_TABLE_DATA_ROW_CLASS,
        "hover:bg-transparent hover:[&>td]:bg-transparent",
        isSelected && txnSelectedMainRowCn(false)
      )}
      data-pl-txn-selected={isSelected ? "" : undefined}
      onClick={() => onSelect(rowId)}
      onDoubleClick={onDoubleClick}
    >
      {children}
    </TableRow>
  );
}

export function GstrVoucherTableRow({
  voucherId,
  voucher,
  selectedVoucherId,
  onSelect,
  onEdit,
  children,
}: {
  voucherId: string;
  voucher: any;
  selectedVoucherId: string | null;
  onSelect: (id: string) => void;
  onEdit: (voucher: any) => void;
  children: ReactNode;
}) {
  return (
    <GstrSelectableTableRow
      rowId={voucherId}
      selectedRowId={selectedVoucherId}
      onSelect={onSelect}
      onDoubleClick={() => onEdit(voucher)}
    >
      {children}
    </GstrSelectableTableRow>
  );
}

/** Full-bleed GSTR report layout inside Reports detail panel — no outer card gap. */
export function GstrReportShell({ title, description, dateControls, headerActions, onPrint, children }: GstrReportShellProps) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background" data-pl-gstr-report="">
      <Card className="flex min-h-0 flex-1 flex-col rounded-none border-0 bg-card shadow-none">
        <CardHeader className="flex-shrink-0 space-y-0 border-b bg-card px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <CardTitle className="text-base">{title}</CardTitle>
              <CardDescription className="text-xs">{description}</CardDescription>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {headerActions}
              {dateControls}
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 shrink-0"
                title="Print"
                aria-label="Print"
                onClick={() => (onPrint ? onPrint() : window.print())}
              >
                <Printer className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col bg-card p-0">{children}</CardContent>
      </Card>
    </div>
  );
}

export function GstrReportTableScroll({ children }: { children: ReactNode }) {
  return (
    <div
      className="min-h-0 flex-1 overflow-auto bg-card pl-ledger-txn-scroll-native pl-gstr-table-scroll"
      data-pl-gstr-table=""
    >
      {children}
    </div>
  );
}
