"use client";

/**
 * Company open: once per local calendar day, silently evaluate auto splite (day 46+ of running FY).
 */

import { useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { useVouchers } from "@/hooks/useVouchers";
import { resolveCompanyFiscalYearDates } from "@/lib/companyFyVoucherSuggestion";
import { localCalendarDayKey, runFiscalAutoSplitDailyCheck } from "@/lib/fiscalAutoSplit";

export function FiscalAutoSplitBootstrap() {
  const { user } = useAuth();
  const { companyId, company, loading: companyLoading } = useCompany();
  const { vouchers, loading: vouchersLoading } = useVouchers();
  const ranForKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const cid = companyId?.trim();
    if (!user || companyLoading || vouchersLoading || !cid || !company) return;

    const dayKey = localCalendarDayKey();
    const runKey = `${cid}:${dayKey}`;
    if (ranForKeyRef.current === runKey) return;
    ranForKeyRef.current = runKey;

    runFiscalAutoSplitDailyCheck({
      companyId: cid,
      country: company.country,
      companyDates: resolveCompanyFiscalYearDates(company),
      vouchers,
    });
  }, [user, companyId, company, companyLoading, vouchersLoading, vouchers]);

  return null;
}
