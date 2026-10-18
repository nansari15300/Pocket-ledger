"use client";

import { persistCompanyRootSettingsPatch } from "@/lib/persistCompanyRootSettings";

export type SalePurchaseDiscountSide = "sale" | "purchase";

type CompanyDiscountDefaultSource = {
  saleDiscountExpenseAccountId?: string | null;
  purchaseDiscountExpenseAccountId?: string | null;
} | null | undefined;

function fieldKey(side: SalePurchaseDiscountSide): "saleDiscountExpenseAccountId" | "purchaseDiscountExpenseAccountId" {
  return side === "sale" ? "saleDiscountExpenseAccountId" : "purchaseDiscountExpenseAccountId";
}

/** Company-wide default — sab users ke naye sale/purchase forms par. */
export function readCompanyDiscountExpenseDefault(
  side: SalePurchaseDiscountSide,
  company: CompanyDiscountDefaultSource
): string {
  return String(company?.[fieldKey(side)] ?? "").trim();
}

export async function persistCompanyDiscountExpenseDefault(opts: {
  side: SalePurchaseDiscountSide;
  companyId: string;
  company: Parameters<typeof persistCompanyRootSettingsPatch>[0]["company"];
  accountId: string;
  reloadLocalCompanyRegistry?: () => void;
  triggerSync?: () => void;
}): Promise<void> {
  const id = String(opts.accountId ?? "").trim();
  if (!id) return;
  const key = fieldKey(opts.side);
  await persistCompanyRootSettingsPatch({
    companyId: opts.companyId,
    company: opts.company,
    patch: { [key]: id },
    reloadLocalCompanyRegistry: opts.reloadLocalCompanyRegistry,
    triggerSync: opts.triggerSync,
  });
}

export async function clearCompanyDiscountExpenseDefault(opts: {
  side: SalePurchaseDiscountSide;
  companyId: string;
  company: Parameters<typeof persistCompanyRootSettingsPatch>[0]["company"];
  reloadLocalCompanyRegistry?: () => void;
  triggerSync?: () => void;
}): Promise<void> {
  await persistCompanyRootSettingsPatch({
    companyId: opts.companyId,
    company: opts.company,
    patch: { [fieldKey(opts.side)]: "" },
    reloadLocalCompanyRegistry: opts.reloadLocalCompanyRegistry,
    triggerSync: opts.triggerSync,
  });
}
/** Totals summary cyan box — andar se 4px side inset; lambe amount clip na hon bahar. */
export const SALE_PURCHASE_TOTALS_SUMMARY_BOX_MOBILE =
  "col-span-2 bg-cyan-50 border border-cyan-300/80 rounded-lg px-1 py-2 space-y-0 w-full min-w-0 max-w-full overflow-hidden";

export const SALE_PURCHASE_TOTALS_SUMMARY_BOX_DESKTOP =
  "border border-cyan-300/80 rounded-lg px-1 py-4 space-y-0 bg-cyan-50 w-full min-w-0 max-w-full overflow-hidden";

export const SALE_PURCHASE_TOTALS_SUMMARY_ROW =
  "flex justify-between items-center gap-2 min-w-0 w-full max-w-full";

/** Right-side money — container ke andar truncate; hover title = full value. */
export const SALE_PURCHASE_TOTALS_SUMMARY_AMOUNT =
  "min-w-0 max-w-[min(100%,52%)] flex-[1_1_auto] text-right tabular-nums truncate shrink";
