"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  BS_DATE_RANGE_PRESETS,
  dateRangeFromPreset,
  type BsDateRangePresetKey,
} from "@/lib/bsDateRangePresets";

type DateRangePresetRowProps = {
  onApply: (range: { from: Date; to: Date }) => void;
  country?: string | null;
  disabled?: boolean;
  className?: string;
};

export function DateRangePresetRow({
  onApply,
  country,
  disabled = false,
  className,
}: DateRangePresetRowProps) {
  const apply = React.useCallback(
    (key: BsDateRangePresetKey) => {
      const range = dateRangeFromPreset(key, { country });
      if (range?.from && range?.to) {
        onApply({ from: range.from, to: range.to });
      }
    },
    [country, onApply]
  );

  return (
    <div
      className={cn(
        "flex flex-wrap gap-1.5 overflow-x-auto pb-1 scroll-touch [scrollbar-width:thin]",
        className
      )}
    >
      {BS_DATE_RANGE_PRESETS.map(({ key, label }) => (
        <Button
          key={key}
          type="button"
          variant="secondary"
          size="sm"
          className="h-7 shrink-0 px-2 text-xs max-sm:h-6 max-sm:px-1.5 max-sm:text-[10px] leading-tight"
          disabled={disabled}
          onClick={() => apply(key)}
        >
          {label}
        </Button>
      ))}
    </div>
  );
}
