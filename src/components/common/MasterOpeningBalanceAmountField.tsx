"use client";

import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  openingBalanceAbsFromSigned,
  openingBalanceSideFromSigned,
  signedOpeningBalanceFromAbsSide,
  type OpeningBalanceSide,
} from "@/lib/masterOpeningBalanceSigned";
import type { Control, FieldValues, Path } from "react-hook-form";

/** Opening balance amount + Dr/Cr — stores signed value on `openingBalance` (Dr +, Cr −). */
export function MasterOpeningBalanceAmountField<T extends FieldValues>({
  control,
  name = "openingBalance" as Path<T>,
  label = "Opening Balance",
  disabled,
  className,
}: {
  control: Control<T>;
  name?: Path<T>;
  label?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => {
        const signed = Number(field.value) || 0;
        const side = openingBalanceSideFromSigned(signed);
        const absAmount = openingBalanceAbsFromSigned(signed);

        const commit = (nextAbs: number, nextSide: OpeningBalanceSide) => {
          field.onChange(signedOpeningBalanceFromAbsSide(nextAbs, nextSide));
        };

        return (
          <FormItem className={className}>
            <FormLabel>{label}</FormLabel>
            <div className="flex gap-2">
              <FormControl>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  disabled={disabled}
                  className="min-w-0 flex-1"
                  value={absAmount === 0 ? "" : absAmount}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const nextAbs = raw === "" ? 0 : Math.abs(parseFloat(raw) || 0);
                    commit(nextAbs, side);
                  }}
                  onBlur={field.onBlur}
                />
              </FormControl>
              <Select
                value={side}
                disabled={disabled}
                onValueChange={(v) => commit(absAmount, v as OpeningBalanceSide)}
              >
                <SelectTrigger
                  className={cn(
                    "w-[88px] shrink-0 font-semibold",
                    side === "dr" ? "text-green-700" : "text-red-700"
                  )}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dr">Dr</SelectItem>
                  <SelectItem value="cr">Cr</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}
