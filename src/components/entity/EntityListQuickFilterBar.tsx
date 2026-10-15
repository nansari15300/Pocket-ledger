"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type EntityListQuickFilter =
  | "default"
  | "dr"
  | "cr"
  | "name"
  | "date"
  | "settled"
  | "non_settled";

type Props = {
  active: EntityListQuickFilter;
  onChange: (next: EntityListQuickFilter) => void;
  className?: string;
  /** Subset of footer toggles (e.g. notes list: default / By Name / By Date only). */
  only?: EntityListQuickFilter[];
};

const FILTERS: Array<{ key: EntityListQuickFilter; label: string }> = [
  { key: "default", label: "Default" },
  { key: "dr", label: "Dr" },
  { key: "cr", label: "Cr" },
  { key: "name", label: "By Name" },
  { key: "date", label: "By Date" },
  { key: "settled", label: "Settled" },
  { key: "non_settled", label: "Non Settled" },
];

/** Account/entity list footer filters — horizontal scroll for mobile + desktop compact bar. */
export function EntityListQuickFilterBar({ active, onChange, className, only }: Props) {
  const filters = only?.length ? FILTERS.filter((f) => only.includes(f.key)) : FILTERS;
  return (
    <div
      className={cn(
        "pl-mlc-quick-filter-row w-full min-w-0 border-t border-blue-300/60 bg-blue-100/80 px-2 py-[2px]",
        className,
      )}
    >
      <div className="w-full min-w-0 overflow-x-auto pl-ledger-footer-scroll">
        <div className="pl-mlc-quick-filter-inner flex min-w-full w-full items-center gap-[2px]">
          {filters.map((f) => (
            <Button
              key={f.key}
              type="button"
              size="sm"
              variant={active === f.key ? "default" : "outline"}
              className="pl-mlc-quick-filter-pill h-7 min-w-0 px-2 text-[11px] whitespace-nowrap"
              onClick={() => onChange(f.key)}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
