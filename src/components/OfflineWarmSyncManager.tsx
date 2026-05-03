"use client";

/**
 * Online + cloud-backed company hone par ek baar (debounced) full warm sync:
 * plans JSON, Firestore masters/vouchers SQLite mirror + attachment blob prefetch.
 * Company switch / visibility / `online` pe dubara queue — airplane mode offline UI ke liye.
 */

import { useCallback, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { runOfflineFullWarmSync } from "@/lib/offlineFullWarmSync";

const WARM_DEBOUNCE_MS = 4500;

export function OfflineWarmSyncManager() {
  const { user } = useAuth();
  const { companyId, company, loading } = useCompany();

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runAbortRef = useRef<AbortController | null>(null);

  /** Shared schedule + cancel — multiple triggers same debounce funnel */
  const scheduleWarmFullSync = useCallback(() => {
    if (typeof window === "undefined" || typeof navigator === "undefined") return;
    if (!user || !navigator.onLine) return;
    if (loading || !companyId?.trim() || !company) return;

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      runAbortRef.current?.abort();
      const c = new AbortController();
      runAbortRef.current = c;
      void runOfflineFullWarmSync({
        company,
        localCompanyId: companyId.trim(),
        signal: c.signal,
      });
    }, WARM_DEBOUNCE_MS);
  }, [user, loading, companyId, company]);

  useEffect(() => {
    scheduleWarmFullSync();
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [scheduleWarmFullSync]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onOnline = () => scheduleWarmFullSync();
    const onVisibility = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") scheduleWarmFullSync();
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [scheduleWarmFullSync]);

  useEffect(() => {
    return () => {
      runAbortRef.current?.abort();
    };
  }, [companyId]);

  return null;
}
