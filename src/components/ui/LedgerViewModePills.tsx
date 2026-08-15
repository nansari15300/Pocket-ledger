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
      // `contents` = children join the parent 2-row pill-row grid (no nested flex cell).
      className={cn("contents", className)}
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

type ToggleProps<T extends string> = {
  value: T;
  /** Do options — mobile footer par ek button se toggle */
  options: [Option<T>, Option<T>];
  onChange: (value: T) => void;
  className?: string;
};

/**
 * Mobile ledger footer — Statement / Bill wise (ya Spend wise) ek button:
 * label = switch karne wala mode; click par `onChange(alternate)`.
 */
export function LedgerViewModeToggleButton<T extends string>({
  value,
  options,
  onChange,
  className,
}: ToggleProps<T>) {
  const alternate = options.find((o) => o.value !== value) ?? options[1];
  // Non-default mode (bill_wise / spend_wise) active → orange; statement par violet
  const primaryMode = options[0].value;
  const onAlternateMode = value !== primaryMode;

  return (
    <Button
      type="button"
      className={cn(
        "flex-1 h-6 min-w-0 rounded-md text-xs font-medium",
        onAlternateMode
          ? "bg-orange-600 hover:bg-orange-700 text-white"
          : "bg-violet-600 hover:bg-violet-700 text-white",
        className
      )}
      aria-label={`Switch to ${alternate.label}`}
      onClick={() => onChange(alternate.value)}
    >
      {alternate.label}
    </Button>
  );
}
