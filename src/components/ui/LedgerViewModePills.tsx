"use client";

import { Button } from "@/components/ui/button";
import { LEDGER_HEADER_PILL_CN } from "@/lib/ledgerHeaderChrome";
import { cn } from "@/lib/utils";

type Option<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
  className?: string;
  buttonClassName?: string;
};

/** Statement / Bill wise — blue pill; selected par sirf border green (bg blue hi) */
export function LedgerViewModePills<T extends string>({
  value,
  options,
  onChange,
  className,
  buttonClassName,
}: Props<T>) {
  return (
    <div
      data-pl-ledger-view-pills
      className={cn("flex items-center gap-1 flex-shrink-0", className)}
      role="group"
      aria-label="View mode"
    >
      {options.map((opt) => {
        const isActive = value === opt.value;
        return (
        <Button
          key={opt.value}
          type="button"
          variant="chromePill"
          size="sm"
          // aria-pressed mat — chromePill variant + pro CSS green lagata hai
          aria-current={isActive ? "true" : undefined}
          data-pl-ledger-view-active={isActive ? "true" : undefined}
          className={cn(
            LEDGER_HEADER_PILL_CN,
            buttonClassName,
            // Pro theme !important blue override se bachne ke liye
            isActive && "!border-green-600 hover:!border-green-600"
          )}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </Button>
        );
      })}
    </div>
  );
}
