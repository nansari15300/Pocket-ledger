"use client";

/**
 * Company open: once per local calendar day, silently evaluate auto splite (day 46+ of running FY).
 * Uses FY voucher index (light) — does not walk all in-memory vouchers (that froze EXE on company switch).
 */

import { useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { resolveCompanyFiscalYearDates } from "@/lib/companyFyVoucherSuggestion";
import { localCalendarDayKey, runFiscalAutoSplitDailyCheck } from "@/lib/fiscalAutoSplit";
import { ensureFyVoucherIndex } from "@/lib/fiscalSplit/fyVoucherIndex";

export function FiscalAutoSplitBootstrap() {
  const { user } = useAuth();
  const { companyId, company, loading: companyLoading } = useCompany();
  const ranForKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const cid = companyId?.trim();
    if (!user || companyLoading || !cid || !company) return;

    const dayKey = localCalendarDayKey();
    const runKey = `${cid}:${dayKey}`;
    if (ranForKeyRef.current === runKey) return;

    let cancelled = false;
    const companySnapshot = company;

    const run = () => {
      if (cancelled) return;
      void (async () => {
        try {
          const { index } = await ensureFyVoucherIndex({
            companyId: cid,
            company: companySnapshot,
          });
          if (cancelled) return;
          ranForKeyRef.current = runKey;
          runFiscalAutoSplitDailyCheck({
            companyId: cid,
            company: companySnapshot,
            country: companySnapshot.country,
            companyDates: resolveCompanyFiscalYearDates(companySnapshot),
            fyKeys: index.fyKeys,
          });
        } catch (err) {
          console.warn("[FiscalAutoSplitBootstrap] deferred check failed", err);
        }
      })();
    };

    // After paint / idle — never block company switch click.
    let idleId: number | null = null;
    let timeoutId: number | null = null;
    const ric = typeof window !== "undefined" ? window.requestIdleCallback : undefined;
    if (typeof ric === "function") {
      idleId = ric.call(window, () => run(), { timeout: 2500 });
    } else {
      timeoutId = window.setTimeout(run, 400);
    }

    return () => {
      cancelled = true;
      if (idleId != null && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId != null) window.clearTimeout(timeoutId);
    };
  }, [user, companyId, company, companyLoading]);

  return null;
}
