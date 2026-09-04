"use client";

/**
 * Inter Company amount — identity strip jaisa 2 column (source | target);
 * har side: label box + amount box ek row; comma + Cr; min width 25mm.
 * Source side: optional Other charge (Payment Out jaisa).
 */
import { useState, type ComponentProps, type ReactNode } from "react";
import type { Control, FieldValues } from "react-hook-form";
import { PlusCircle, X } from "lucide-react";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import {
  interCompanyAmountInputSizingClass,
  interCompanyInputClass,
  interCompanyReadOnlyCopyInputClass,
} from "@/lib/interCompany/interCompanyVoucherChrome";
import { cn } from "@/lib/utils";

type FormatPrint = (amount: number, options?: { noSuffix?: boolean }) => string;

type AccountOption = { value: string; label: string };

type Props = {
  // Voucher form typed control — `FieldValues` assign karne ke liye parent par cast.
  control: Control<FieldValues>;
  amount: number;
  formatCurrencyForPrint: FormatPrint;
  fieldsDisabled?: boolean;
  editLocked?: boolean;
  /** Source Payment Out — other charge toggle + fields */
  showOtherCharge?: boolean;
  otherChargeEnabled?: boolean;
  onOtherChargeEnabledChange?: (enabled: boolean) => void;
  otherChargeAccountOptions?: AccountOption[];
  otherChargeBalance?: number | null;
  onOtherChargeDefault?: () => void;
  otherChargeAccountId?: string;
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
  showOtherCharge = false,
  otherChargeEnabled = false,
  onOtherChargeEnabledChange,
  otherChargeAccountOptions = [],
  otherChargeBalance = null,
  onOtherChargeDefault,
  otherChargeAccountId = "",
}: Props) {
  const [sourceFocused, setSourceFocused] = useState(false);
  const [sourceDraft, setSourceDraft] = useState("");

  const targetDisplay = formatInterCompanyAmountDisplay(formatCurrencyForPrint, amount);
  const sourceReadOnly = Boolean(fieldsDisabled || editLocked);
  const showOtherChargeCard =
    showOtherCharge && (otherChargeEnabled || Boolean(otherChargeAccountId));

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
                <div className="flex flex-wrap items-center justify-between gap-2">
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
                  {showOtherCharge && !sourceReadOnly ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 shrink-0 rounded-full border-blue-300 bg-blue-100 px-3 text-xs font-semibold text-blue-900 hover:bg-blue-200"
                      disabled={fieldsDisabled}
                      onClick={() => {
                        if (showOtherChargeCard) {
                          onOtherChargeEnabledChange?.(false);
                        } else {
                          onOtherChargeEnabledChange?.(true);
                        }
                      }}
                    >
                      <PlusCircle className="mr-1 h-3.5 w-3.5" />
                      Other charge
                    </Button>
                  ) : null}
                </div>
                <FormMessage className="mt-1" />
              </FormItem>
            );
          }}
        />

        {showOtherChargeCard ? (
          <div className="mt-2 space-y-2 rounded-md border border-blue-200/80 bg-blue-50/40 p-2">
            <FormField
              control={control}
              name="otherChargeAccountId"
              render={({ field }) => (
                <FormItem className="min-w-0 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <FormLabel className="text-xs">Other Charge</FormLabel>
                    {!sourceReadOnly ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 rounded-full px-2 text-xs"
                        disabled={fieldsDisabled}
                        onClick={() => onOtherChargeEnabledChange?.(false)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    ) : null}
                  </div>
                  {otherChargeBalance !== null ? (
                    <p
                      className={cn(
                        "text-[10px] font-semibold text-right",
                        otherChargeBalance >= 0 ? "text-green-600" : "text-red-600"
                      )}
                    >
                      {formatCurrencyForPrint(Math.abs(otherChargeBalance), { noSuffix: true })}{" "}
                      {otherChargeBalance >= 0 ? "Dr" : "Cr"}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="min-w-0 flex-1">
                      <Combobox
                        triggerClassName="w-full min-w-0"
                        options={otherChargeAccountOptions}
                        value={field.value}
                        onChange={(val) => field.onChange(val)}
                        placeholder="Select account"
                        disabled={fieldsDisabled || sourceReadOnly}
                      />
                    </div>
                    {otherChargeAccountId && onOtherChargeDefault && !sourceReadOnly ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9 shrink-0 rounded-full px-3 text-sm font-medium"
                        onClick={onOtherChargeDefault}
                      >
                        Default
                      </Button>
                    ) : null}
                    <FormField
                      control={control}
                      name="otherChargeAmount"
                      render={({ field: amountField }) => (
                        <FormItem className="min-w-[5.5rem] shrink-0 space-y-1">
                          <FormLabel className="text-xs whitespace-nowrap">Amount</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              value={amountField.value ?? ""}
                              onChange={(e) => {
                                amountField.onChange(
                                  e.target.value === "" ? 0 : Number(e.target.value)
                                );
                              }}
                              disabled={fieldsDisabled || sourceReadOnly}
                              className={cn(interCompanyInputClass, interCompanyAmountInputSizingClass)}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        ) : null}
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
