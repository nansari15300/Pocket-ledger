"use client";

/**
 * Inter Company amount — identity strip jaisa 2 column (source | target);
 * har side: label box + amount box ek row; comma + Cr; min width 25mm.
 */
import { useState, type ComponentProps, type ReactNode } from "react";
import type { Control, FieldValues } from "react-hook-form";
import { FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  interCompanyAmountInputSizingClass,
  interCompanyInputClass,
  interCompanyReadOnlyCopyInputClass,
} from "@/lib/interCompany/interCompanyVoucherChrome";
import { cn } from "@/lib/utils";

type FormatPrint = (amount: number, options?: { noSuffix?: boolean }) => string;

type Props = {
  // Voucher form typed control — `FieldValues` assign karne ke liye parent par cast.
  control: Control<FieldValues>;
  amount: number;
  formatCurrencyForPrint: FormatPrint;
  fieldsDisabled?: boolean;
  editLocked?: boolean;
};

const AMOUNT_MEASURE_FALLBACK = "0.00 Cr";

/** Upar Source/Target strip jaisa — ek column ka panel */
const amountSidePanelClass =
  "min-w-0 flex-1 rounded-md border bg-background/80 px-2.5 py-2";

function parseInterCompanyAmountInput(raw: string): number {
  const cleaned = String(raw || "")
    .replace(/,/g, "")
    .replace(/\s*(Dr|Cr)\s*/gi, "")
    .replace(/[^\d.-]/g, "")
    .trim();
  if (!cleaned) return 0;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function formatInterCompanyAmountDisplay(formatCurrencyForPrint: FormatPrint, amount: number): string {
  const n = Number(amount);
  if (!n || n <= 0) return "";
  return `${formatCurrencyForPrint(n, { noSuffix: true })} Cr`;
}

function InterCompanyAmountLabelBox({ children }: { children: ReactNode }) {
  return (
    <div
      className={cn(
        interCompanyInputClass,
        "inline-flex h-9 shrink-0 items-center whitespace-nowrap px-3 text-sm font-medium"
      )}
    >
      {children}
    </div>
  );
}

function InterCompanyResponsiveAmountInput({
  displayText,
  placeholder = AMOUNT_MEASURE_FALLBACK,
  className,
  ...inputProps
}: {
  displayText: string;
  placeholder?: string;
} & ComponentProps<typeof Input>) {
  const measure = (displayText && displayText.trim()) || placeholder || AMOUNT_MEASURE_FALLBACK;

  return (
    <div className="inline-grid max-w-full [&>*]:col-start-1 [&>*]:row-start-1">
      <span
        className={cn(
          interCompanyInputClass,
          "invisible whitespace-pre border border-transparent px-3 text-sm pointer-events-none min-w-[25mm]"
        )}
        aria-hidden
      >
        {measure}
      </span>
      <Input
        {...inputProps}
        placeholder={placeholder}
        className={cn(interCompanyInputClass, interCompanyAmountInputSizingClass, className)}
      />
    </div>
  );
}

/** Label box + amount box — ek row (panel ke andar) */
function InterCompanyAmountSideRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <InterCompanyAmountLabelBox>{label}</InterCompanyAmountLabelBox>
      {children}
    </div>
  );
}

export function InterCompanyAmountDualFields({
  control,
  amount,
  formatCurrencyForPrint,
  fieldsDisabled,
  editLocked,
}: Props) {
  const [sourceFocused, setSourceFocused] = useState(false);
  const [sourceDraft, setSourceDraft] = useState("");

  const targetDisplay = formatInterCompanyAmountDisplay(formatCurrencyForPrint, amount);
  const sourceReadOnly = Boolean(fieldsDisabled || editLocked);

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <div className={amountSidePanelClass}>
        <FormField
          control={control}
          name="amount"
          render={({ field }) => {
            const formatted = formatInterCompanyAmountDisplay(
              formatCurrencyForPrint,
              Number(field.value) || 0
            );
            const sourceDisplay = sourceReadOnly
              ? formatted
              : sourceFocused
                ? sourceDraft
                : formatted;

            return (
              <FormItem className="min-w-0 space-y-0">
                <InterCompanyAmountSideRow label="Payment Out (source)">
                  <FormControl>
                    <InterCompanyResponsiveAmountInput
                      type="text"
                      inputMode="decimal"
                      displayText={sourceDisplay}
                      placeholder={AMOUNT_MEASURE_FALLBACK}
                      value={sourceDisplay}
                      readOnly={sourceReadOnly}
                      disabled={sourceReadOnly ? false : fieldsDisabled}
                      className={cn(sourceReadOnly && interCompanyReadOnlyCopyInputClass)}
                      onFocus={() => {
                        if (sourceReadOnly) return;
                        setSourceFocused(true);
                        const n = Number(field.value) || 0;
                        setSourceDraft(n > 0 ? String(n) : "");
                      }}
                      onChange={(e) => {
                        if (sourceReadOnly) return;
                        const raw = e.target.value;
                        setSourceDraft(raw);
                        field.onChange(parseInterCompanyAmountInput(raw));
                      }}
                      onBlur={() => {
                        if (sourceReadOnly) return;
                        setSourceFocused(false);
                        field.onChange(parseInterCompanyAmountInput(sourceDraft));
                      }}
                    />
                  </FormControl>
                </InterCompanyAmountSideRow>
                <FormMessage className="mt-1" />
              </FormItem>
            );
          }}
        />
      </div>

      <div className={amountSidePanelClass}>
        <InterCompanyAmountSideRow label="Payment In (target)">
          <InterCompanyResponsiveAmountInput
            type="text"
            readOnly
            aria-readonly
            displayText={targetDisplay}
            placeholder="Same as source"
            value={targetDisplay}
            className={cn("bg-muted/40", interCompanyReadOnlyCopyInputClass)}
          />
        </InterCompanyAmountSideRow>
      </div>
    </div>
  );
}
