"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Bank/Cash add/edit — mobile + desktop same: 2 pills per row, 3px gap */
export const bankCashFormTwoColClass =
  "pl-master-form-row grid grid-cols-2 gap-[3px] items-stretch [&>*]:min-w-0";

/** Group + Bank Name + IFSC — 3 pills one row on all breakpoints */
export const bankCashFormThreeColClass =
  "pl-master-form-row grid grid-cols-3 gap-[3px] items-stretch [&>*]:min-w-0";

export function BankCashFormTwoColGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn(bankCashFormTwoColClass, className)}>{children}</div>;
}

export function BankCashFormThreeColGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn(bankCashFormThreeColClass, className)}>{children}</div>;
}
