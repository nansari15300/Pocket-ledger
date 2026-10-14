"use client";

import { LedgerHeaderTogglePill } from "@/components/ui/LedgerHeaderTogglePill";

type Props = {
  active: boolean;
  onToggle: () => void;
  className?: string;
};

/** Party / group ledger header — show only TDS slice rows + TDS columns. */
export function LedgerTdsFilterPill({ active, onToggle, className }: Props) {
  return (
    <LedgerHeaderTogglePill
      label="TDS"
      active={active}
      onToggle={onToggle}
      groupAriaLabel="TDS filter"
      className={className}
    />
  );
}
