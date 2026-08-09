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
export function EntityListQuickFilterBar({ active, onChange, className }: Props) {
  return (
    <div className={cn("border-t border-blue-300/60 bg-blue-100/80 px-2 py-1.5", className)}>
      <div className="overflow-x-auto">
        <div className="flex w-max items-center gap-1">
          {FILTERS.map((f) => (
            <Button
              key={f.key}
              type="button"
              size="sm"
              variant={active === f.key ? "default" : "outline"}
              className="h-7 whitespace-nowrap px-2 text-[11px]"
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
