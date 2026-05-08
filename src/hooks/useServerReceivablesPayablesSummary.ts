"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { isLocalOnlyMode } from "@/lib/localMode";
import { isStaticAppBuild } from "@/lib/isStaticAppBuild";
import type { DateRange } from "@/components/ui/ad-calendar";
import type { ReceivablesPayablesFinancialSummary } from "@/lib/receivablesPayablesFinancialSummary";

/** Date range / company badalne par API spam kam — aggregation fetch debounce. */
const DEBOUNCE_MS = 400;

/**
 * Cloud company: R/P summary Admin API se — browser par vouchers array par bada reduce kam.
 * Local / static / encrypted company → `useClientFallback` true (purana client compute).
 */
export function useServerReceivablesPayablesSummary(opts: {
  companyId: string | undefined;
  storageOption?: string;
  receivablesDateRange: DateRange | undefined;
  enabled: boolean;
}) {
  const { user } = useAuth();
  const { companyId, storageOption, receivablesDateRange, enabled } = opts;

  const [loading, setLoading] = useState(false);
  const [useClientFallback, setUseClientFallback] = useState(false);
  const [serverSummary, setServerSummary] = useState<ReceivablesPayablesFinancialSummary | null>(null);
  const [summaryRangeKey, setSummaryRangeKey] = useState<string | null>(null);

  const latestRangeKeyRef = useRef<string>("");

  const rangeKey = useMemo(() => {
    if (!receivablesDateRange?.from) return "all";
    const f = receivablesDateRange.from.getTime();
    const t = receivablesDateRange.to?.getTime() ?? "none";
    return `${f}_${t}`;
  }, [receivablesDateRange]);

  latestRangeKeyRef.current = rangeKey;

  const cloudBacked =
    enabled &&
    !isStaticAppBuild() &&
    !isLocalOnlyMode() &&
    String(storageOption || "").toLowerCase() !== "local" &&
    !!companyId &&
    !!user &&
    !String(user.uid || "").startsWith("local:");

  useEffect(() => {
    if (!cloudBacked) {
      setLoading(false);
      setUseClientFallback(false);
      setServerSummary(null);
      setSummaryRangeKey(null);
      return;
    }

    let cancelled = false;
    const ac = new AbortController();
    const timer = window.setTimeout(async () => {
      const requestRangeKey = rangeKey;
      setLoading(true);
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/company/dashboard-financial-summary", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            companyId,
            receivablesDateRange: receivablesDateRange?.from
              ? {
                  from: receivablesDateRange.from.toISOString(),
                  to: receivablesDateRange.to?.toISOString(),
                }
              : undefined,
          }),
          signal: ac.signal,
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          useClientFallback?: boolean;
          summary?: ReceivablesPayablesFinancialSummary;
        };
        if (cancelled) return;
        if (requestRangeKey !== latestRangeKeyRef.current) return;

        if (!res.ok) {
          setUseClientFallback(true);
          setServerSummary(null);
          setSummaryRangeKey(null);
          setLoading(false);
          return;
        }
        if (data.useClientFallback || data.ok === false) {
          setUseClientFallback(true);
          setServerSummary(null);
          setSummaryRangeKey(null);
          setLoading(false);
          return;
        }
        if (data.summary && data.ok === true) {
          setServerSummary(data.summary);
          setSummaryRangeKey(requestRangeKey);
          setUseClientFallback(false);
        }
      } catch (e: unknown) {
        if (cancelled || (e instanceof Error && e.name === "AbortError")) return;
        setUseClientFallback(true);
        setServerSummary(null);
        setSummaryRangeKey(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      ac.abort();
      window.clearTimeout(timer);
    };
    // `rangeKey` hi date-range ka stable identity — `receivablesDateRange` object ref har render par alag ho sakta hai.
  }, [cloudBacked, companyId, rangeKey, user]);

  const summaryForCurrentRange =
    summaryRangeKey === rangeKey ? serverSummary : null;

  const preferServer = cloudBacked && !useClientFallback;

  return {
    summary: summaryForCurrentRange,
    loading,
    useClientFallback: !cloudBacked || useClientFallback,
    preferServer,
  };
}
