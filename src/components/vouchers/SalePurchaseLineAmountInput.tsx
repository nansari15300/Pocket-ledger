"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { formatAmountInputDisplay, sanitizeAmountInputString } from "@/lib/amountInputNormalize";
import { cn } from "@/lib/utils";
import {
  SALE_PURCHASE_LINE_AMOUNT_INPUT_CLASS,
  salePurchaseLineAmountInputStyleFromText,
} from "@/lib/salePurchaseLineColumnLabels";

type SalePurchaseLineAmountInputProps = {
  value: unknown;
  readOnly?: boolean;
  disabled?: boolean;
  title?: string;
  name?: string;
  onBlur?: () => void;
  onRawChange: (raw: string) => void;
  className?: string;
};

/** Line Amount — typing par draft width; `.` ke baad digits clip na hon. */
export function SalePurchaseLineAmountInput({
  value,
  readOnly,
  disabled,
  title,
  name,
  onBlur,
  onRawChange,
  className,
}: SalePurchaseLineAmountInputProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const display = draft ?? formatAmountInputDisplay(value);
  const widthText = display === "" ? "0" : display;

  return (
    <Input
      type="text"
      inputMode="decimal"
      data-pl-raw-number=""
      name={name}
      readOnly={readOnly}
      disabled={disabled}
      title={title}
      value={display}
      style={salePurchaseLineAmountInputStyleFromText(widthText)}
      className={cn(SALE_PURCHASE_LINE_AMOUNT_INPUT_CLASS, readOnly && "bg-muted", className)}
      onFocus={() => {
        if (readOnly || disabled) return;
        setDraft(formatAmountInputDisplay(value) || String(value ?? ""));
      }}
      onBlur={() => {
        setDraft(null);
        onBlur?.();
      }}
      onChange={(e) => {
        if (readOnly || disabled) return;
        const raw = sanitizeAmountInputString(e.target.value);
        setDraft(raw);
        onRawChange(raw);
      }}
    />
  );
}
