"use client";

import { useEffect, useMemo, useState } from "react";
import { useCompany } from "@/hooks/useCompany";
import { getLocalCompanyById } from "@/lib/localCompanyStore";

type VoucherFeatureSettings = {
  enableCrossCompanyLedgerCopy?: boolean;
  enableShareForReconciliation?: boolean;
};

function readSettings(row: VoucherFeatureSettings | null | undefined): VoucherFeatureSettings {
  return {
    enableCrossCompanyLedgerCopy:
      typeof row?.enableCrossCompanyLedgerCopy === "boolean" ? row.enableCrossCompanyLedgerCopy : undefined,
    enableShareForReconciliation:
      typeof row?.enableShareForReconciliation === "boolean" ? row.enableShareForReconciliation : undefined,
  };
}

export function useCompanyVoucherFeatureSettings(): Required<VoucherFeatureSettings> {
  const { companyId, company, allCompanies } = useCompany();
  const [cached, setCached] = useState<VoucherFeatureSettings>({});

  const fromContext = readSettings(company as VoucherFeatureSettings | null | undefined);
  const fromRegistry = useMemo(() => {
    const id = String(companyId || "").trim();
    if (!id) return {};
    return readSettings(allCompanies.find((row) => row.id === id) as VoucherFeatureSettings | undefined);
  }, [allCompanies, companyId]);

  useEffect(() => {
    const id = String(companyId || "").trim();
    if (!id) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const row = await getLocalCompanyById(id, { includeDeleted: true });
        if (cancelled) return;
        setCached(readSettings(row as VoucherFeatureSettings | null));
      } catch {
        if (!cancelled) setCached({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  return {
    enableCrossCompanyLedgerCopy:
      companyId
        ? fromContext.enableCrossCompanyLedgerCopy ??
          fromRegistry.enableCrossCompanyLedgerCopy ??
          cached.enableCrossCompanyLedgerCopy ??
          false
        : false,
    enableShareForReconciliation:
      companyId
        ? fromContext.enableShareForReconciliation ??
          fromRegistry.enableShareForReconciliation ??
          cached.enableShareForReconciliation ??
          false
        : false,
  };
}
