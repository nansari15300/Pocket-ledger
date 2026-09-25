"use client";

import { DateRangePresetRow } from "@/components/ui/DateRangePresetRow";
import { useLedgerDefaultDateRangeReset } from "@/hooks/useLedgerDefaultDateRangeReset";
import type { LedgerPaginationResetHandlers } from "@/lib/ledgerLast10View";

type Props = {
  onDateRangeChange: (range: undefined) => void;
  onApply: (range: { from: Date; to: Date }) => void;
  onAfterDefault?: () => void;
  /** With "Last 10": rows/page → 10 and page → 1 (party/staff/bank detail footers). */
  ledgerPaginationReset?: LedgerPaginationResetHandlers | null;
  country?: string | null;
  disabled?: boolean;
  className?: string;
};

/** Master ledger calendars — "Last 10" = no date filter + tail 10 txns + default FY scope. */
export function MasterLedgerDateRangePresetRow({
  onDateRangeChange,
  onApply,
  onAfterDefault,
  ledgerPaginationReset,
  country,
  disabled,
  className,
}: Props) {
  const resetDefault = useLedgerDefaultDateRangeReset(onDateRangeChange, ledgerPaginationReset);

  return (
    <DateRangePresetRow
      country={country}
      disabled={disabled}
      className={className}
      onApply={onApply}
      onApplyDefault={() => {
        resetDefault();
        onAfterDefault?.();
      }}
    />
  );
}
