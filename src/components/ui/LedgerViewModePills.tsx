"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Option<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
  className?: string;
  buttonClassName?: string;
};

/** Statement / Spend wise / Bill wise — do pill; jo select ho us par green border */
export function LedgerViewModePills<T extends string>({
  value,
  options,
  onChange,
  className,
  buttonClassName,
}: Props<T>) {
  return (
    <div className={cn("flex items-center gap-1 flex-shrink-0", className)} role="group" aria-label="View mode">
      {options.map((opt) => (
        <Button
          key={opt.value}
          type="button"
          variant="chromePill"
          size="sm"
          aria-pressed={value === opt.value}
          data-chrome-pill-active={value === opt.value ? "true" : undefined}
          className={cn("h-10", buttonClassName)}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </Button>
      ))}
    </div>
  );
}
