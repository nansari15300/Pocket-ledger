"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import BsDatePicker from "@/components/ui/BsDatePicker";
import type { DateRange } from "@/components/ui/ad-calendar";
import {
  FINANCIAL_SUMMARY_COMPARISON_OPTIONS,
  FINANCIAL_SUMMARY_PERIOD_PRESETS,
  financialSummaryRangeFromPreset,
  type FinancialSummaryComparisonMode,
  type FinancialSummaryPeriodPreset,
} from "@/lib/reports/financialSummaryPresets";
import { cn } from "@/lib/utils";
import {
  financialSummaryCardClass,
  financialSummaryCardProps,
  financialSummaryPillCn,
} from "./financialSummaryCardStyles";

type FinancialSummaryFiltersProps = {
  draftRange: DateRange | undefined;
  onDraftRangeChange: (range: DateRange | undefined) => void;
  onApply: () => void;
  preset: FinancialSummaryPeriodPreset;
  onPresetChange: (preset: FinancialSummaryPeriodPreset) => void;
  comparisonMode: FinancialSummaryComparisonMode;
  onComparisonModeChange: (mode: FinancialSummaryComparisonMode) => void;
  country?: string | null;
  disabled?: boolean;
  className?: string;
};

export function FinancialSummaryFilters({
  draftRange,
  onDraftRangeChange,
  onApply,
  preset,
  onPresetChange,
  comparisonMode,
  onComparisonModeChange,
  country,
  disabled = false,
  className,
}: FinancialSummaryFiltersProps) {
  const handlePresetSelect = (value: string) => {
    const key = value as FinancialSummaryPeriodPreset;
    onPresetChange(key);
    if (key === "custom") return;
    const next = financialSummaryRangeFromPreset(key, { country });
    if (next) onDraftRangeChange({ from: next.from, to: next.to });
  };

  return (
    <div
      {...financialSummaryCardProps}
      className={cn(
        "rounded-lg border bg-card p-4 space-y-3 print:hidden",
        financialSummaryCardClass,
        className
      )}
    >
      <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
        <div className="flex flex-col gap-2 min-w-0 flex-1">
          <Label className="text-sm font-medium">Period</Label>
          <div className="flex flex-wrap items-center gap-2">
            <BsDatePicker
              isRange
              valueAD={draftRange}
              onChangeAD={onDraftRangeChange}
              disabled={disabled}
              rangeEmptyLabel="Start date"
              skipDateRangeThemeDetail
              className={cn(financialSummaryPillCn, "w-auto min-w-[140px] justify-start")}
            />
            <Button
              type="button"
              variant="outline"
              onClick={onApply}
              disabled={disabled || !draftRange?.from}
              className={financialSummaryPillCn}
            >
              Apply
            </Button>
            <Select value={preset} onValueChange={handlePresetSelect} disabled={disabled}>
              <SelectTrigger className={cn(financialSummaryPillCn, "w-[200px]")}>
                <SelectValue placeholder="Preset" />
              </SelectTrigger>
              <SelectContent>
                {FINANCIAL_SUMMARY_PERIOD_PRESETS.map((p) => (
                  <SelectItem key={p.key} value={p.key}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex flex-col gap-2 shrink-0">
          <Label className="text-sm font-medium text-muted-foreground">Compare with:</Label>
          <Select
            value={comparisonMode}
            onValueChange={(v) => onComparisonModeChange(v as FinancialSummaryComparisonMode)}
            disabled={disabled}
          >
            <SelectTrigger className={cn(financialSummaryPillCn, "w-[220px]")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FINANCIAL_SUMMARY_COMPARISON_OPTIONS.map((o) => (
                <SelectItem key={o.key} value={o.key}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
