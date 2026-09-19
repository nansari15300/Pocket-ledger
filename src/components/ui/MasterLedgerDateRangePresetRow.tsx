"use client";

import { DateRangePresetRow } from "@/components/ui/DateRangePresetRow";
import { useLedgerDefaultDateRangeReset } from "@/hooks/useLedgerDefaultDateRangeReset";

type Props = {
  onDateRangeChange: (range: undefined) => void;
  onApply: (range: { from: Date; to: Date }) => void;
  onAfterDefault?: () => void;
  country?: string | null;
  disabled?: boolean;
  className?: string;
};

/** Master ledger calendars — "Last 10" clears filter and reloads default scope. */
export function MasterLedgerDateRangePresetRow({
  onDateRangeChange,
  onApply,
  onAfterDefault,
  country,
  disabled,
  className,
}: Props) {
  const resetDefault = useLedgerDefaultDateRangeReset(onDateRangeChange);

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
