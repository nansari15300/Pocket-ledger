"use client";

import { useMemo } from "react";
import { useVouchers } from "@/hooks/useVouchers";
import { QUOTATION_MASTER_KIND_LABEL } from "../constants";
import type { QuotationMasterKind, QuotationMasterOption } from "../types";

function asName(row: { name?: string; accountName?: string } | null | undefined): string {
  return String(row?.name || row?.accountName || "").trim();
}

export function useQuotationMasters() {
  const {
    processedParties,
    processedAccounts,
    processedStaff,
    processedTaxes,
    processedExpenseAccounts,
    processedItems,
  } = useVouchers();

  const masters = useMemo<QuotationMasterOption[]>(() => {
    const out: QuotationMasterOption[] = [];
    const push = (
      kind: QuotationMasterKind,
      rows: Array<{ id?: string; name?: string; accountName?: string; fileUrl?: string | null; isSystemAccount?: boolean }>
    ) => {
      for (const row of rows || []) {
        const id = String(row?.id || "").trim();
        const name = asName(row);
        if (!id || !name || row?.isSystemAccount) continue;
        out.push({ id, kind, name, fileUrl: row.fileUrl || null });
      }
    };
    push("party", processedParties as never);
    push("bank", processedAccounts as never);
    push("staff", processedStaff as never);
    push("tax", processedTaxes as never);
    push("expense", processedExpenseAccounts as never);
    push("item", processedItems as never);
    return out.sort((a, b) => {
      const ka = QUOTATION_MASTER_KIND_LABEL[a.kind].localeCompare(QUOTATION_MASTER_KIND_LABEL[b.kind]);
      if (ka !== 0) return ka;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
  }, [
    processedParties,
    processedAccounts,
    processedStaff,
    processedTaxes,
    processedExpenseAccounts,
    processedItems,
  ]);

  const byKey = useMemo(() => {
    const map = new Map<string, QuotationMasterOption>();
    for (const row of masters) map.set(`${row.kind}:${row.id}`, row);
    return map;
  }, [masters]);

  const findByName = (kind: QuotationMasterKind | "", name: string): QuotationMasterOption | null => {
    const needle = String(name || "").trim().toLowerCase();
    if (!needle) return null;
    const pool = kind ? masters.filter((row) => row.kind === kind) : masters;
    return pool.find((row) => row.name.trim().toLowerCase() === needle) || null;
  };

  return { masters, byKey, findByName };
}
