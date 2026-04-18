"use client";

import * as React from "react";
import type { DropdownProps } from "react-day-picker";
import { YearSelectShowMore } from "@/components/ui/year-select-show-more";
import { AD_PICKER_MAX_YEAR, AD_PICKER_MIN_YEAR } from "@/lib/calendarChrome";

/** `options` na mile tab — `calendar.tsx` ke `fromYear`/`toYear` (AD_PICKER_*) ke saath sync */
const FALLBACK_MIN = AD_PICKER_MIN_YEAR;
const FALLBACK_MAX = AD_PICKER_MAX_YEAR;

/**
 * react-day-picker ka `YearsDropdown` — native lamba `<select>` ki jagah Nepali calendar jaisa:
 * chhoti scroll list + "Show more · older/newer years".
 */
export function AdCalendarYearsDropdown(props: DropdownProps) {
  const { value, onChange, disabled, options, className } = props;

  const { minYear, maxYear } = React.useMemo(() => {
    if (!options?.length) {
      return { minYear: FALLBACK_MIN, maxYear: FALLBACK_MAX };
    }
    return {
      minYear: Math.min(...options.map((o) => o.value)),
      maxYear: Math.max(...options.map((o) => o.value)),
    };
  }, [options]);

  const yearValue =
    typeof value === "number" && !Number.isNaN(value) ? value : Number(value);

  const handleYear = React.useCallback(
    (y: number) => {
      if (!onChange) return;
      // DayPicker `handleYearChange` — `Number(e.target.value)` (native select jaisa)
      onChange({ target: { value: String(y) } } as React.ChangeEvent<HTMLSelectElement>);
    },
    [onChange]
  );

  return (
    <YearSelectShowMore
      value={Number.isFinite(yearValue) ? yearValue : new Date().getFullYear()}
      onChange={handleYear}
      minYear={minYear}
      maxYear={maxYear}
      disabled={disabled}
      className={className}
    />
  );
}
