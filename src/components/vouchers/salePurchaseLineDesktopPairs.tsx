"use client";

import { cn } from "@/lib/utils";

/** TDS | TDS Amt. share the parent line-grid tracks so header and rows stay aligned. */
export const SALE_PURCHASE_TDS_PAIR_GRID = "col-span-2 grid grid-cols-subgrid";

/** Tax | Tax Amt. share the parent line-grid tracks so header and rows stay aligned. */
export const SALE_PURCHASE_TAX_PAIR_GRID = "col-span-2 grid grid-cols-subgrid";

export function salePurchaseLinePairTd(
  tdBase: string,
  innerGrid: string,
  extra?: string
) {
  return cn(tdBase, "col-span-2 p-0", innerGrid, extra);
}

export function salePurchaseLinePairTh(
  thBase: string,
  innerGrid: string,
  extra?: string
) {
  return cn(thBase, "col-span-2 p-0 whitespace-nowrap", innerGrid, extra);
}

export function salePurchasePairHeaderCell(
  align: "left" | "center" | "right",
  className?: string
) {
  return cn(
    "px-2 py-2 box-border text-xs font-semibold text-foreground",
    align === "left" && "text-left",
    align === "center" && "text-center",
    align === "right" && "text-right",
    className
  );
}

export function salePurchasePairBodyCell(side: "left" | "right", className?: string) {
  return cn(
    "box-border whitespace-nowrap",
    side === "left" ? "pl-2 pr-1 py-1" : "pl-1 pr-2 py-1",
    className
  );
}
