"use client";

/**
 * Online + cloud-backed company hone par ek baar (debounced) full warm sync:
 * plans JSON, Firestore masters/vouchers SQLite mirror + attachment blob prefetch.
 * Company switch / visibility / `online` pe dubara queue — airplane mode offline UI ke liye.
 *
 * APK/static EXE: `allCompanies` me har cloud row ke liye serial warm — offline attachment preview tak.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Company } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import {
  runOfflineFullWarmSync,
  isCloudBackedCompanyShape,
} from "@/lib/offlineFullWarmSync";
import { isStaticAppBuild } from "@/lib/isStaticAppBuild";
import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";
import { useFirstLoginWarmGate } from "@/contexts/FirstLoginWarmGateContext";
import { isLocalOnlyMode } from "@/lib/localMode";

const WARM_DEBOUNCE_MS = 4500;
/** Doosri company ka warm overlap na ho selected company ke debounced run se (`WARM_DEBOUNCE_MS` ke baad shuru). */
const EMBEDDED_MULTI_WALK_START_MS = 5_800;
/** Har company warm ke beech thoda gap — APK memory / bandwidth. */
const EMBEDDED_MULTI_GAP_MS = 750;
/** User se bina click: online rehne par periodic resweep se missed/failing attachments bhi dheere-dheere cache ho jayein. */
const EMBEDDED_MULTI_RESWEEP_MS = 8 * 60 * 1000;
import { backgroundWarmSyncEnabled } from "@/lib/firebaseBillingOptimization";

const BACKGROUND_WARM_SYNC_ENABLED = backgroundWarmSyncEnabled();

export function OfflineWarmSyncManager() {
  const { user } = useAuth();
  const { companyId, company, loading, allCompanies } = useCompany();
  /** Pehli-login full-screen warm chal raha ho to yahan duplicate pull mat chalao */
  const { gateActive } = useFirstLoginWarmGate();

  /** `build:static` / Capacitor: multi-company attachment + mirror queue */
  const embeddedMultiClient =
    isStaticAppBuild() || (typeof window !== "undefined" && isCapacitorNativeApp());
  // Embedded local-first: online event handlers se UI jump avoid; polling loop background me kaam kare.
  const suppressOnlineEventWarm = embeddedMultiClient && isLocalOnlyMode();

  /** Id set badalne par walker dubara queue — nayi shared company SQLite me aate hi prefetch. */
  const cloudBackedSig = useMemo(() => {
    const rows =
      allCompanies?.filter((c): c is Company => isCloudBackedCompanyShape(c as Company)) ?? [];
    return [...new Set(rows.map((c) => c.id).filter(Boolean))].sort().join(",");
  }, [allCompanies]);

  /** Mount/start offline hone par walker effect pehle return karta hai — `online` event se dubara queue. */
  const [embeddedOnlineWarmTick, bumpEmbeddedOnlineWarmTick] = useState(0);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (suppressOnlineEventWarm) return;
    const onOnline = () => bumpEmbeddedOnlineWarmTick((n) => n + 1);
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [suppressOnlineEventWarm]);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runAbortRef = useRef<AbortController | null>(null);
  const allCompaniesLatestRef = useRef(allCompanies);

  /** Serial multi-company walk — company list / abort lifecycle */
  const embeddedWalkAbortRef = useRef<AbortController | null>(null);
  const embeddedWalkTimerRef = useRef<number | null>(null);

  allCompaniesLatestRef.current = allCompanies;

  /** Shared schedule + cancel — multiple triggers same debounce funnel */
  const scheduleWarmFullSync = useCallback(() => {
    if (!BACKGROUND_WARM_SYNC_ENABLED) return;
    // Startup responsiveness mode: disable hidden background warm/API fan-out.
    if (typeof window === "undefined" || typeof navigator === "undefined") return;
    if (gateActive) return;
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
        // If warm sync is re-enabled later, keep startup attachment prefetch off by policy.
        includeAttachmentPrefetch: false,
      });
    }, WARM_DEBOUNCE_MS);
  }, [user, loading, companyId, company, gateActive]);

  useEffect(() => {
    if (!BACKGROUND_WARM_SYNC_ENABLED) return;
    scheduleWarmFullSync();
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [scheduleWarmFullSync]);

  useEffect(() => {
    if (!BACKGROUND_WARM_SYNC_ENABLED) return;
    if (typeof window === "undefined") return;
    if (suppressOnlineEventWarm) return;
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
  }, [scheduleWarmFullSync, suppressOnlineEventWarm]);

  useEffect(() => {
    return () => {
      runAbortRef.current?.abort();
    };
  }, [companyId]);

  // APK / static EXE: registry me jitni cloud-backed companies — ek ke baad ek warm (`runOfflineFullWarmSync` HTTPS prefetch + SQLite mirror).
  useEffect(() => {
    if (!BACKGROUND_WARM_SYNC_ENABLED) return;
    embeddedWalkAbortRef.current?.abort();
    embeddedWalkAbortRef.current = null;
    if (embeddedWalkTimerRef.current != null) {
      window.clearTimeout(embeddedWalkTimerRef.current);
      embeddedWalkTimerRef.current = null;
    }

    if (gateActive) return;
    if (!embeddedMultiClient || !user || loading || !cloudBackedSig.trim()) return;
    if (typeof navigator === "undefined") return;

    const ac = new AbortController();
    embeddedWalkAbortRef.current = ac;

    const walkAllCloudCompaniesOnce = async () => {
      const snapshot = allCompaniesLatestRef.current;
      const rows =
        snapshot?.filter((c) => isCloudBackedCompanyShape(c as Company | null)) ?? [];

      for (const row of rows) {
        if (ac.signal.aborted || typeof navigator === "undefined" || !navigator.onLine) break;
        try {
          await runOfflineFullWarmSync({
            company: row,
            localCompanyId: String(row.id).trim(),
            signal: ac.signal,
            // Background walker must not prefetch attachments globally.
            includeAttachmentPrefetch: false,
          });
        } catch {
          /* per-row network failure: continue with next company */
        }
        await new Promise((r) => setTimeout(r, EMBEDDED_MULTI_GAP_MS));
      }
    };

    const scheduleNextPass = (delayMs: number) => {
      if (ac.signal.aborted) return;
      embeddedWalkTimerRef.current = window.setTimeout(() => {
        embeddedWalkTimerRef.current = null;
        void runPeriodicPassLoop();
      }, delayMs);
    };

    const runPeriodicPassLoop = async () => {
      if (ac.signal.aborted || typeof navigator === "undefined") return;
      if (!navigator.onLine) {
        // No online-event dependency: offline hone par bhi loop ko silent retry mode me zinda rakho.
        scheduleNextPass(30_000);
        return;
      }
      await walkAllCloudCompaniesOnce();
      // Auto background warm: all-company cache complete hone tak repeated passes (no manual button/click).
      scheduleNextPass(EMBEDDED_MULTI_RESWEEP_MS);
    };

    scheduleNextPass(EMBEDDED_MULTI_WALK_START_MS);

    return () => {
      ac.abort();
      if (embeddedWalkTimerRef.current != null) {
        window.clearTimeout(embeddedWalkTimerRef.current);
        embeddedWalkTimerRef.current = null;
      }
    };
  }, [embeddedMultiClient, user, loading, cloudBackedSig, embeddedOnlineWarmTick, gateActive]);

  return null;
}
