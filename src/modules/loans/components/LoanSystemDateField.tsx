"use client";

import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TableCell, TableHead } from "@/components/ui/table";
import BsDatePicker from "@/components/ui/BsDatePicker";
import { cn } from "@/lib/utils";
import { useDate, type DateSystem } from "@/hooks/useDate";
import {
  VOUCHER_PC_DATE_AD_PILL,
  VOUCHER_PC_DATE_BOTH_SLOT,
  VOUCHER_PC_DATE_BS_PILL,
  VOUCHER_PC_DATE_ROW,
} from "@/components/vouchers/voucherButtonStyles";
import { formatIsoDate, tryParseIsoDate } from "../utils/loanDateUtils";

export function loanDateColumnCount(dateSystem: DateSystem): number {
  return dateSystem === "Both" ? 2 : 1;
}

export function useLoanIsoDateParts() {
  const { dateSystem, formatDate, formatDateBS } = useDate();
  const both = dateSystem === "Both";
  const parts = (iso?: string | null) => {
    const d = tryParseIsoDate(iso);
    if (!d) {
      const empty = "—";
      if (!iso) return { bs: empty, ad: empty, single: empty };
      return { bs: String(iso), ad: String(iso), single: String(iso) };
    }
    return {
      bs: formatDateBS(d) || "—",
      ad: formatDate(d) || "—",
      single: dateSystem === "AD" ? formatDate(d) : formatDateBS(d),
    };
  };
  return { both, parts, dateSystem };
}

/** Table header — one column (AD/BS) or Due Date (BS) + Due Date (AD) when Both. */
export function LoanTableDateHead({ label }: { label: string }) {
  const { both } = useLoanIsoDateParts();
  if (both) {
    return (
      <>
        <TableHead>{label} (BS)</TableHead>
        <TableHead>{label} (AD)</TableHead>
      </>
    );
  }
  return <TableHead>{label}</TableHead>;
}

/** Table body — matching LoanTableDateHead cells. */
export function LoanTableDateCell({ iso, className }: { iso?: string | null; className?: string }) {
  const { both, parts } = useLoanIsoDateParts();
  const p = parts(iso);
  if (both) {
    return (
      <>
        <TableCell className={className}>{p.bs}</TableCell>
        <TableCell className={className}>{p.ad}</TableCell>
      </>
    );
  }
  return <TableCell className={className}>{p.single}</TableCell>;
}

const ISO_DATE_PREFIX = /^\d{4}-\d{2}-\d{2}/;

export function isLoanIsoDateCellValue(raw: unknown): raw is string {
  return typeof raw === "string" && ISO_DATE_PREFIX.test(raw);
}

/** Split ISO date columns into BS + AD when company calendar is Both. */
export function expandLoanReportForBothColumns(
  columns: string[],
  rows: Record<string, string | number>[],
  formatDate: (d: Date) => string,
  formatDateBS: (d: Date) => string,
  dateSystem: DateSystem
): { columns: string[]; rows: Record<string, string | number>[] } {
  if (dateSystem !== "Both") {
    return {
      columns,
      rows: rows.map((row) => {
        const out: Record<string, string | number> = {};
        for (const c of columns) {
          const raw = row[c];
          if (isLoanIsoDateCellValue(raw)) {
            const d = tryParseIsoDate(raw);
            out[c] = d ? (dateSystem === "AD" ? formatDate(d) : formatDateBS(d)) || raw : raw;
          } else {
            out[c] = raw;
          }
        }
        return out;
      }),
    };
  }

  const expandedColumns: string[] = [];
  for (const c of columns) {
    if (rows.some((r) => isLoanIsoDateCellValue(r[c]))) {
      expandedColumns.push(`${c} (BS)`, `${c} (AD)`);
    } else {
      expandedColumns.push(c);
    }
  }

  const expandedRows = rows.map((row) => {
    const out: Record<string, string | number> = {};
    for (const c of columns) {
      const raw = row[c];
      if (isLoanIsoDateCellValue(raw)) {
        const d = tryParseIsoDate(raw);
        out[`${c} (BS)`] = d ? formatDateBS(d) || "—" : raw;
        out[`${c} (AD)`] = d ? formatDate(d) || "—" : raw;
      } else {
        out[c] = raw;
      }
    }
    return out;
  });

  return { columns: expandedColumns, rows: expandedRows };
}

export function formatLoanIsoDisplay(
  iso: string | null | undefined,
  formatDateBySystem: (date: Date | null | undefined) => string,
  empty = "—"
): string {
  const date = tryParseIsoDate(iso);
  if (!date) return iso ? String(iso) : empty;
  return formatDateBySystem(date) || empty;
}

export function useFormatLoanIso() {
  const { formatDateBySystem } = useDate();
  return (iso?: string | null) => formatLoanIsoDisplay(iso, formatDateBySystem);
}

export function LoanSystemDateField({
  value,
  onChange,
  disabled,
  allowEmpty,
  className,
  placeholder = "Pick a date",
}: {
  value: string;
  onChange: (iso: string) => void;
  disabled?: boolean;
  allowEmpty?: boolean;
  className?: string;
  placeholder?: string;
}) {
  const { dateSystem, formatDate } = useDate();
  const selected = tryParseIsoDate(value) || undefined;

  const apply = (date: Date | undefined) => {
    if (!date) {
      if (allowEmpty) onChange("");
      return;
    }
    onChange(formatIsoDate(date));
  };

  return (
    <div className={cn(VOUCHER_PC_DATE_ROW, className)}>
      {(dateSystem === "BS" || dateSystem === "Both") && (
        <div className={cn(dateSystem === "Both" ? VOUCHER_PC_DATE_BOTH_SLOT : "w-full min-w-0")}>
          <BsDatePicker
            isRange={false}
            valueAD={selected}
            onChangeAD={(d) => apply(d)}
            disabled={disabled}
            numberOfMonths={1}
            className={VOUCHER_PC_DATE_BS_PILL}
          />
        </div>
      )}
      {(dateSystem === "AD" || dateSystem === "Both") && (
        <div className={cn(dateSystem === "Both" ? VOUCHER_PC_DATE_BOTH_SLOT : "w-full min-w-0")}>
          <Popover modal>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                disabled={disabled}
                className={cn(VOUCHER_PC_DATE_AD_PILL, !selected && "text-muted-foreground")}
              >
                {selected ? formatDate(selected) : placeholder}
                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={selected}
                onSelect={(date) => {
                  if (!date) {
                    apply(undefined);
                    return;
                  }
                  date.setHours(12, 0, 0, 0);
                  apply(date);
                }}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>
      )}
    </div>
  );
}
