"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import type { Control } from "react-hook-form";

type Props = {
  control: Control<any>;
  /** Default `isTdsVerified`; salary line: `lineItems.${i}.isTdsVerified` */
  name?: string;
  disabled?: boolean;
  /** Mobile summary — slightly smaller label */
  compact?: boolean;
};

/**
 * Sale/Purchase / Add Salary: TDS/Tax ke right — 20×20 yellow Verify tick.
 * Callers: pass `editingDisabled` only — do NOT tie to bill-wise link lock (`deleteDisabledWhenLinked`).
 */
export function SalePurchaseTdsVerifyTick({
  control,
  name = "isTdsVerified",
  disabled,
  compact,
}: Props) {
  return (
    <FormField
      control={control}
      name={name as any}
      render={({ field }) => (
        <FormItem className="flex shrink-0 flex-row items-center gap-1.5 space-y-0">
          <FormControl>
            <Checkbox
              checked={field.value === true}
              onCheckedChange={(checked) => field.onChange(checked === true)}
              disabled={disabled}
              className="h-[20px] w-[20px] shrink-0 rounded border-2 border-yellow-500 bg-yellow-50 text-yellow-950 shadow-none data-[state=checked]:border-yellow-600 data-[state=checked]:bg-yellow-400 data-[state=checked]:text-yellow-950"
              aria-label="Verify TDS"
            />
          </FormControl>
          <FormLabel
            className={cn(
              "font-bold leading-none text-yellow-800",
              disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
              compact ? "text-[10px]" : "text-xs"
            )}
          >
            Verify
          </FormLabel>
        </FormItem>
      )}
    />
  );
}
