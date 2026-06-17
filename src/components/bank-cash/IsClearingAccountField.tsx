"use client";

import { Info } from "lucide-react";
import type { Control, FieldPath, FieldValues } from "react-hook-form";
import { FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** IC clearing picker — tooltip copy (i icon me) */
export const IS_CLEARING_ACCOUNT_INFO =
  "When ticked, this account appears in Inter Company voucher clearing account picker.";

/** Bank/Cash master — IC voucher clearing dropdown; info sirf i icon tooltip me */
export function IsClearingAccountField<T extends FieldValues>({
  control,
  name = "isClearing" as FieldPath<T>,
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
        <FormItem
          className={cn(
            // Bank form inputs tone match: soft blue bg + blue border.
            "flex flex-row items-start gap-2.5 rounded-md border border-blue-200 bg-blue-50/60 p-3 space-y-0",
            className
          )}
        >
          <FormControl>
            <Checkbox
              checked={field.value === true}
              onCheckedChange={(checked) => field.onChange(checked === true)}
            />
          </FormControl>
          <div className="flex min-w-0 flex-1 items-start justify-between gap-2">
            <FormLabel className="cursor-pointer font-normal text-sm leading-snug">
              Is clearing
            </FormLabel>
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="shrink-0 text-blue-500 hover:text-blue-700"
                    aria-label="About is clearing account"
                  >
                    <Info className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-sm text-xs leading-relaxed">
                  {IS_CLEARING_ACCOUNT_INFO}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </FormItem>
      )}
    />
  );
}
