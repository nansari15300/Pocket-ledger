"use client";

import type { Control, FieldValues } from "react-hook-form";
import { AllowVoucherMinusBalanceField } from "@/components/bank-cash/AllowVoucherMinusBalanceField";
import { IsClearingAccountField } from "@/components/bank-cash/IsClearingAccountField";
import { cn } from "@/lib/utils";

/** Bank add/edit — minus balance + is clearing, same row me 2 bordered boxes */
export function BankAccountToggleFlagsRow<T extends FieldValues>({
  control,
  className,
}: {
  control: Control<T>;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-2 gap-[3px] [&>*]:min-w-0", className)}>
      <AllowVoucherMinusBalanceField control={control} />
      <IsClearingAccountField control={control} />
    </div>
  );
}
