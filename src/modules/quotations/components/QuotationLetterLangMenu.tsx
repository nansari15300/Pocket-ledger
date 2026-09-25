"use client";

import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { LETTER_LANG_OPTIONS } from "../letterhead";
import type { QuotationLetterLang } from "../types";

export type QuotationLetterMenuOption = {
  id: string;
  label: string;
  name: string;
  isDeva?: boolean;
};

function labelKey(label: string): string {
  return String(label || "")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueByLabel(items: QuotationLetterMenuOption[]): QuotationLetterMenuOption[] {
  const seen = new Set<string>();
  return items.filter((row) => {
    const key = labelKey(row.label);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isDevaLabel(row: QuotationLetterMenuOption): boolean {
  return /[\u0900-\u097F]/.test(row.label);
}

export function QuotationLetterLangMenu({
  value,
  labels,
  options,
  onChange,
  className,
}: {
  value: string;
  labels?: Record<QuotationLetterLang, string>;
  options?: QuotationLetterMenuOption[];
  onChange: (id: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const allItems: QuotationLetterMenuOption[] =
    options ||
    LETTER_LANG_OPTIONS.map((opt) => ({
      id: opt.id,
      label: (labels && labels[opt.id]) || opt.name,
      name: opt.name,
      isDeva: opt.id !== "en",
    }));
  const items = uniqueByLabel(allItems);
  const current = allItems.find((row) => row.id === value);
  const selected =
    items.find((row) => row.id === value) ||
    items.find((row) => labelKey(row.label) === labelKey(current?.label || "")) ||
    items[0];
  const selectedKey = labelKey(selected?.label || current?.label || "");
  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>
        <span
          role="button"
          tabIndex={0}
          className={cn("quotation-letter-lang-trigger", selected && isDevaLabel(selected) && "is-deva", className)}
          title="Change label"
        >
          {selected?.label || current?.label || ""}:
        </span>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="w-max min-w-[8.5rem] rounded-md border bg-white p-1 shadow-lg"
        onMouseDown={(e) => e.preventDefault()}
      >
        {items.map((opt) => (
          <button
            key={opt.id}
            type="button"
            className={cn(
              "quotation-letter-lang-item",
              isDevaLabel(opt) && "is-deva",
              (value === opt.id || labelKey(opt.label) === selectedKey) && "is-active"
            )}
            onClick={() => {
              onChange(opt.id);
              setOpen(false);
            }}
          >
            <span className="quotation-letter-lang-item-label">{opt.label}</span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
