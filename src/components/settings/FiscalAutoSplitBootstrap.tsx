"use client";

/**
 * Company open: once per local calendar day, silently evaluate auto splite (day 46+ of running FY).
 * Must NOT compete with dashboard boot — cheap day-check first; FY index only if apply needed.
 */

import { useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { resolveCompanyFiscalYearDates } from "@/lib/companyFyVoucherSuggestion";
import {
  getLocalFiscalSplitOrDefaults,
  writeLocalFiscalSplit,
} from "@/lib/localFiscalSplitStore";
import {
  localCalendarDayKey,
  runFiscalAutoSplitDailyCheck,
  shouldTriggerFiscalAutoSplit,
} from "@/lib/fiscalAutoSplit";
import { ensureFyVoucherIndex } from "@/lib/fiscalSplit/fyVoucherIndex";

/** Let dashboard / outstanding paint before any FY index work. */
const AUTO_SPLIT_DEFER_MS = 12_000;

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

    // Fast path: already checked today — zero SQLite / FY work.
    const local = getLocalFiscalSplitOrDefaults(cid);
    if (local.fiscalAutoSplitLastCheckDay === dayKey) {
      ranForKeyRef.current = runKey;
      return;
    }

    let cancelled = false;

    const run = () => {
      if (cancelled) return;
      const row = companyRef.current;
      if (!row) return;

      void (async () => {
        try {
          const companyDates = resolveCompanyFiscalYearDates(row);
          const latest = getLocalFiscalSplitOrDefaults(cid);
          if (latest.fiscalAutoSplitLastCheckDay === dayKey) {
            ranForKeyRef.current = runKey;
            return;
          }

          const shouldApply =
            latest.fiscalAutoSplitEnabled &&
            !latest.fiscalSplitConfiguredByUser &&
            shouldTriggerFiscalAutoSplit(row.country, new Date(), companyDates);

          if (!shouldApply) {
            writeLocalFiscalSplit(cid, {
              ...latest,
              fiscalAutoSplitLastCheckDay: dayKey,
            });
            ranForKeyRef.current = runKey;
            return;
          }

          // Only when auto-split must tick a new FY — build index in background.
          const { index } = await ensureFyVoucherIndex({
            companyId: cid,
            company: row,
          });
          if (cancelled) return;
          ranForKeyRef.current = runKey;
          runFiscalAutoSplitDailyCheck({
            companyId: cid,
            company: row,
            country: row.country,
            companyDates,
            fyKeys: index.fyKeys,
          });
        } catch (err) {
          console.warn("[FiscalAutoSplitBootstrap] deferred check failed", err);
        }
      })();
    };

    // Long defer so EXE dashboard outstanding / vouchers load first.
    const timeoutId = window.setTimeout(() => {
      const ric = window.requestIdleCallback;
      if (typeof ric === "function") {
        ric.call(window, () => run(), { timeout: 4000 });
      } else {
        run();
      }
    }, AUTO_SPLIT_DEFER_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
    // Intentionally companyId-only — full `company` object churn was restarting FY scans and freezing EXE.
  }, [user, companyId, companyLoading]);

  return null;
}
