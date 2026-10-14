"use client";

import { Button } from "@/components/ui/button";
import { LEDGER_HEADER_PILL_CN } from "@/lib/ledgerHeaderChrome";
import { cn } from "@/lib/utils";

type Props = {
  label: string;
  active: boolean;
  onToggle: () => void;
  groupAriaLabel: string;
  className?: string;
};

/** Ledger header toggle — Statement/Bill wise active chrome (blue bg, 1px green border). */
export function LedgerHeaderTogglePill({
  label,
  active,
  onToggle,
  groupAriaLabel,
  className,
}: Props) {
  return (
    <div data-pl-ledger-view-pills className="contents" role="group" aria-label={groupAriaLabel}>
      <Button
        type="button"
        variant="chromePill"
        size="sm"
        aria-current={active ? "true" : undefined}
        data-pl-ledger-view-active={active ? "true" : undefined}
        className={cn(
          LEDGER_HEADER_PILL_CN,
          className,
          active && "!border-green-600 hover:!border-green-600"
        )}
        onClick={onToggle}
      >
        {label}
      </Button>
    </div>
  );
}
