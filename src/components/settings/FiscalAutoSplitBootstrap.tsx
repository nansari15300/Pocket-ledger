"use client";

/**
 * Company open: once per local calendar day, silently evaluate auto splite (day 46+ of running FY).
 *
 * Never rebuild FY voucher index on app/dashboard boot — that froze EXE (~12–20s after open).
 * Auto-split only needs the running FY key; full FY list is Settings → Fiscal year page only.
 */

import { useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { resolveCompanyFiscalYearDates } from "@/lib/companyFyVoucherSuggestion";
import { getLocalFiscalSplitOrDefaults } from "@/lib/localFiscalSplitStore";
import {
  getAnusuchi13FyKey,
} from "@/lib/reports/anusuchi13Confirmation";
import {
  localCalendarDayKey,
  runFiscalAutoSplitDailyCheck,
} from "@/lib/fiscalAutoSplit";

/** After dashboard outstanding / vouchers have had time to settle. */
const AUTO_SPLIT_DEFER_MS = 30_000;

export function FiscalAutoSplitBootstrap() {
  const { user } = useAuth();
  const { companyId, company, loading: companyLoading } = useCompany();
  const companyRef = useRef(company);
  companyRef.current = company;
  const ranForKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const cid = companyId?.trim();
    if (!user || companyLoading || !cid) return;

    const dayKey = localCalendarDayKey();
    const runKey = `${cid}:${dayKey}`;
    if (ranForKeyRef.current === runKey) return;

    const local = getLocalFiscalSplitOrDefaults(cid);
    if (local.fiscalAutoSplitLastCheckDay === dayKey) {
      ranForKeyRef.current = runKey;
      return;
    }

    let cancelled = false;

    const timeoutId = window.setTimeout(() => {
      if (cancelled) return;
      const row = companyRef.current;
      if (!row) return;
      try {
        const companyDates = resolveCompanyFiscalYearDates(row);
        const runningKey = getAnusuchi13FyKey(row.country, new Date(), companyDates);
        ranForKeyRef.current = runKey;
        // Running FY only — no SQLite projection scan / ensureFyVoucherIndex on boot.
        runFiscalAutoSplitDailyCheck({
          companyId: cid,
          company: row,
          country: row.country,
          companyDates,
          fyKeys: runningKey ? [runningKey] : [],
        });
      } catch (err) {
        console.warn("[FiscalAutoSplitBootstrap] deferred check failed", err);
      }
    }, AUTO_SPLIT_DEFER_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [user, companyId, companyLoading]);

  return null;
}
