"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { isLocalOnlyMode } from "@/lib/localMode";
import { isStaticAppBuild } from "@/lib/isStaticAppBuild";
import type { DaybookDailySummary } from "@/lib/accountLedgerDaySummary";

const DEBOUNCE_MS = 350;

/**
 * Cloud company: Daybook Daily Summary Admin API se (vouchers server pages).
 * Local / static / encrypted → client fallback (`useTransactions` ledger math).
 */
export function useServerDaybookDailySummary(opts: {
  companyId: string | undefined;
  storageOption?: string;
  selectedDay: Date | undefined;
  userIdFilter?: string | null;
  enabled: boolean;
}) {
  const { user } = useAuth();
  const { companyId, storageOption, selectedDay, userIdFilter, enabled } = opts;

  const [loading, setLoading] = useState(false);
  const [useClientFallback, setUseClientFallback] = useState(false);
  const [serverSummary, setServerSummary] = useState<DaybookDailySummary | null>(null);
  const [summaryKey, setSummaryKey] = useState<string | null>(null);

  const latestKeyRef = useRef<string>("");

  const requestKey = useMemo(() => {
    if (!selectedDay) return "";
    const day = selectedDay.getTime();
    const uid = userIdFilter ? String(userIdFilter) : "all";
    return `${companyId || ""}_${day}_${uid}`;
  }, [companyId, selectedDay, userIdFilter]);

  latestKeyRef.current = requestKey;

  const cloudBacked =
    enabled &&
    !isStaticAppBuild() &&
    !isLocalOnlyMode() &&
    String(storageOption || "").toLowerCase() !== "local" &&
    !!companyId &&
    !!user &&
    !String(user.uid || "").startsWith("local:") &&
    !!selectedDay;

  useEffect(() => {
    if (!cloudBacked || !requestKey || !selectedDay) {
      setLoading(false);
      setUseClientFallback(false);
      setServerSummary(null);
      setSummaryKey(null);
      return;
    }

    let cancelled = false;
    const ac = new AbortController();
    const timer = window.setTimeout(async () => {
      const keyAtStart = requestKey;
      setLoading(true);
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/company/daybook-daily-summary", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            companyId,
            selectedDay: selectedDay.toISOString(),
            userIdFilter: userIdFilter || null,
          }),
          signal: ac.signal,
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          useClientFallback?: boolean;
          summary?: DaybookDailySummary;
        };
        if (cancelled) return;
        if (keyAtStart !== latestKeyRef.current) return;

        if (!res.ok) {
          setUseClientFallback(true);
          setServerSummary(null);
          setSummaryKey(null);
          setLoading(false);
          return;
        }
        if (data.useClientFallback || data.ok === false) {
          setUseClientFallback(true);
          setServerSummary(null);
          setSummaryKey(null);
          setLoading(false);
          return;
        }
        if (data.summary && data.ok === true) {
          setServerSummary(data.summary);
          setSummaryKey(keyAtStart);
          setUseClientFallback(false);
        }
      } catch (e: unknown) {
        if (cancelled || (e instanceof Error && e.name === "AbortError")) return;
        setUseClientFallback(true);
        setServerSummary(null);
        setSummaryKey(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      ac.abort();
      window.clearTimeout(timer);
    };
  }, [cloudBacked, companyId, requestKey, selectedDay, user, userIdFilter]);

  const summaryForCurrent =
    summaryKey === requestKey ? serverSummary : null;

  return {
    summary: summaryForCurrent,
    loading,
    useClientFallback: !cloudBacked || useClientFallback,
    preferServer: cloudBacked && !useClientFallback,
  };
}
