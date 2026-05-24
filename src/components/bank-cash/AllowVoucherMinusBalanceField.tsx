"use client";

import { Info } from "lucide-react";
import type { Control, FieldPath, FieldValues } from "react-hook-form";
import { FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ALLOW_VOUCHER_MINUS_BALANCE_INFO } from "@/lib/bankAccountMinusBalancePolicy";

/** Bank/Cash master — naam / A/c No ke beech: minus balance par bhi outflow voucher save allow. */
export function AllowVoucherMinusBalanceField<T extends FieldValues>({
  control,
  name = "allowVoucherMinusBalance" as FieldPath<T>,
  className,
}: {
  control: Control<T>;
  name?: FieldPath<T>;
  className?: string;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={cn("space-y-1.5", className)}>
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                  aria-label="About allowing minus balance on vouchers"
                >
                  <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span>Minus balance on vouchers</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-sm text-xs leading-relaxed">
                {ALLOW_VOUCHER_MINUS_BALANCE_INFO}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <FormItem className="flex flex-row items-start gap-2 space-y-0">
            <FormControl>
              <Checkbox
                checked={field.value === true}
                onCheckedChange={(checked) => field.onChange(checked === true)}
              />
            </FormControl>
            <FormLabel className="cursor-pointer font-normal leading-snug">
              Allow to save voucher with minus balance
            </FormLabel>
          </FormItem>
        </FormItem>
      )}
    />
  );
}
