"use client";

/**
 * Pehli login / naye device par splash:
 * - Web: registry hydrate + min ~2s (purana behaviour).
 * - APK / static EXE: splash ko selected-company data warm complete par dismiss karo; attachment startup prefetch OFF.
 *   `OfflineWarmSyncManager` is dauran `gateActive` se band — double warm nahi.
 */

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import type { Company } from "@/hooks/useCompany";
import { Progress } from "@/components/ui/progress";
import { Loader2 } from "lucide-react";
import {
  hasCompanyHydrationSplashBeenSeen,
  markCompanyHydrationSplashSeen,
} from "@/lib/deviceFirstCompanyHydrationSplash";
import { isStaticAppBuild } from "@/lib/isStaticAppBuild";
import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";
import { useFirstLoginWarmGate } from "@/contexts/FirstLoginWarmGateContext";
import {
  runOfflineFullWarmSync,
  isCloudBackedCompanyShape,
} from "@/lib/offlineFullWarmSync";

const MIN_DISPLAY_MS = 2000;
/** Web-only: stuck trap */
const FORCE_DONE_MS = 18_000;

function milestonePercent(args: {
  authLoading: boolean;
  registryLoading: boolean;
  companyId: string | null;
  companyIdMatches: boolean;
}): number {
  if (args.authLoading) return 8;
  if (args.registryLoading) return 62;
  if (!args.companyId) return 94;
  if (args.companyIdMatches) return 100;
  return 82;
}

type CompanyProgress = { data: number; attach: number };

export function FirstDeviceCompanyHydrationOverlay() {
  const pathname = usePathname() || "";
  const { user, loading: authLoading } = useAuth();
  const { companyId, company, allCompanies, loading: registryLoading } = useCompany();
  const { setGateActive } = useFirstLoginWarmGate();

  const uid = user?.uid ?? "";
  const isLoginRoute = pathname === "/" || pathname === "";
  const isCompanySelectionRoute = pathname.startsWith("/company");
  const embeddedFullWarm =
    isStaticAppBuild() || (typeof window !== "undefined" && isCapacitorNativeApp());

  const eligible =
    !!uid && !hasCompanyHydrationSplashBeenSeen(uid) && !authLoading && !isLoginRoute && !isCompanySelectionRoute;

  const overlayClockStartRef = useRef<number | null>(null);
  const dismissedRef = useRef(false);
  const warmStartedRef = useRef(false);
  const warmAbortRef = useRef<AbortController | null>(null);

  const [displayPct, setDisplayPct] = useState(0);
  const [visible, setVisible] = useState(false);

  /** Serial company index — ek complete → agla auto */
  const [warmCompanyIndex, setWarmCompanyIndex] = useState(0);
  const [cloudRows, setCloudRows] = useState<Company[]>([]);
  const [progressById, setProgressById] = useState<Record<string, CompanyProgress>>({});
  const [warmPhase, setWarmPhase] = useState<"idle" | "running" | "done">("idle");
  const [waitingOnline, setWaitingOnline] = useState(false);

  const companyResolvedForSelection = useMemo(() => {
    if (!companyId?.trim()) return true;
    return company != null && company.id === companyId;
  }, [companyId, company]);

  const hydrationDone = !registryLoading && (!companyId || companyResolvedForSelection);

  const displayName =
    (company?.name && company.id === companyId ? company.name : null) ??
    allCompanies.find((c) => c.id === companyId)?.name ??
    "";

  const currentWarmCompany = cloudRows[warmCompanyIndex] ?? null;
  const currentDataPct = currentWarmCompany
    ? progressById[currentWarmCompany.id]?.data ?? 0
    : 0;
  const currentAttachPct = currentWarmCompany
    ? progressById[currentWarmCompany.id]?.attach ?? 0
    : 0;
  // Selected company data progress: dashboard gate isi se kholna hai, all-companies average se nahi.
  const selectedCompanyDataPct = companyId
    ? progressById[companyId]?.data ?? 0
    : currentDataPct;

  const { overallData, overallAttach } = useMemo(() => {
    const ids = cloudRows.map((c) => c.id).filter(Boolean);
    if (!ids.length) return { overallData: 0, overallAttach: 0 };
    let sd = 0;
    let sa = 0;
    for (const id of ids) {
      const p = progressById[id] ?? { data: 0, attach: 0 };
      sd += p.data;
      sa += p.attach;
    }
    return {
      overallData: Math.round(sd / ids.length),
      overallAttach: Math.round(sa / ids.length),
    };
  }, [cloudRows, progressById]);

  // Embedded splash: selected company data mirror 100% hote hi UI unblock karo; attachment download background me jaari rahe.
  useEffect(() => {
    if (!visible || !eligible || !embeddedFullWarm) return;
    if (warmPhase !== "running") return;
    if (selectedCompanyDataPct < 100) return;
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    setDisplayPct(100);
    if (uid) markCompanyHydrationSplashSeen(uid);
    window.setTimeout(() => setVisible(false), 180);
  }, [visible, eligible, embeddedFullWarm, warmPhase, selectedCompanyDataPct, uid]);

  useEffect(() => {
    if (eligible) {
      if (overlayClockStartRef.current == null) overlayClockStartRef.current = Date.now();
      setDisplayPct(0);
      dismissedRef.current = false;
      setVisible(true);
    } else {
      overlayClockStartRef.current = null;
      setVisible(false);
      dismissedRef.current = false;
    }
  }, [eligible]);

  /** Web: milestone cap creep (registry phase) */
  useEffect(() => {
    if (!visible || !eligible || embeddedFullWarm) return;
    const cap = milestonePercent({
      authLoading,
      registryLoading,
      companyId,
      companyIdMatches: companyResolvedForSelection,
    });
    const t = window.setInterval(() => {
      setDisplayPct((p) => {
        if (p >= cap) return Math.min(100, p);
        const gap = cap - p;
        const step = Math.max(0.85, Math.min(14, gap * 0.12 + Math.sin(Date.now() / 900) * 0.35));
        return Math.min(cap, Math.min(100, p + step));
      });
    }, 90);
    return () => window.clearInterval(t);
  }, [
    visible,
    eligible,
    embeddedFullWarm,
    authLoading,
    registryLoading,
    companyId,
    companyResolvedForSelection,
  ]);

  /** APK/static: registry ke baad cloud company list + serial full warm */
  const startEmbeddedWarm = useCallback(async () => {
    if (!embeddedFullWarm || warmStartedRef.current || !uid) return;
    warmStartedRef.current = true;

    const selectedRegistryRow = (allCompanies ?? []).find((c) => c.id === companyId) ?? null;
    const selectedCloudRow =
      selectedRegistryRow && isCloudBackedCompanyShape(selectedRegistryRow as Company)
        ? (selectedRegistryRow as Company)
        : company && company.id === companyId && isCloudBackedCompanyShape(company as Company)
          ? (company as Company)
          : null;
    // Startup warm scope: selected company only; other companies are loaded when user opens them.
    const rows = selectedCloudRow ? [selectedCloudRow] : [];
    setCloudRows(rows);

    const init: Record<string, CompanyProgress> = {};
    for (const r of rows) {
      init[r.id] = { data: 0, attach: 0 };
    }
    setProgressById(init);

    if (rows.length === 0) {
      setWarmPhase("done");
      setGateActive(false);
      markCompanyHydrationSplashSeen(uid);
      setDisplayPct(100);
      window.setTimeout(() => setVisible(false), 280);
      return;
    }

    setGateActive(true);
    setWarmPhase("running");
    setWarmCompanyIndex(0);

    const waitOnline = async () => {
      if (typeof navigator === "undefined") return;
      while (!navigator.onLine) {
        setWaitingOnline(true);
        await new Promise((r) => setTimeout(r, 600));
      }
      setWaitingOnline(false);
    };

    try {
      await waitOnline();

      for (let i = 0; i < rows.length; i++) {
        setWarmCompanyIndex(i);
        const row = rows[i];
        warmAbortRef.current?.abort();
        const ac = new AbortController();
        warmAbortRef.current = ac;

        await waitOnline();

        try {
          const warmResult = await runOfflineFullWarmSync({
            company: row,
            localCompanyId: String(row.id).trim(),
            signal: ac.signal,
            // Startup policy: attachment blobs do not prefetch globally; hover prewarm handles visible rows only.
            includeAttachmentPrefetch: false,
            onProgress: (e) => {
              if (e.kind === "data_subcollection" && e.localCompanyId === row.id) {
                const data = e.total ? Math.min(100, Math.round((e.completed / e.total) * 100)) : 0;
                setProgressById((prev) => ({
                  ...prev,
                  [row.id]: { ...(prev[row.id] ?? { data: 0, attach: 0 }), data },
                }));
              } else if (e.kind === "attachment_item" && e.localCompanyId === row.id) {
                // 0 URLs = kuch download nahi — row 100% maano (warna 0% atke rehta)
                const attach =
                  e.total <= 0 ? 100 : Math.min(100, Math.round((e.done / e.total) * 100));
                setProgressById((prev) => ({
                  ...prev,
                  [row.id]: { ...(prev[row.id] ?? { data: 0, attach: 0 }), attach },
                }));
              }
            },
          });
          if (warmResult && warmResult.attachmentUrlsSeen === 0) {
            setProgressById((prev) => ({
              ...prev,
              [row.id]: { ...(prev[row.id] ?? { data: 0, attach: 0 }), attach: 100 },
            }));
          }
        } catch {
          /* per-company network — agla */
        }

        setProgressById((prev) => ({
          ...prev,
          [row.id]: { data: 100, attach: 100 },
        }));

        await new Promise((r) => setTimeout(r, 400));
      }
    } finally {
      warmAbortRef.current = null;
      setGateActive(false);
    }

    setWarmPhase("done");
    // Warm complete fallback: agar early-dismiss nahi hua to ab splash close + seen mark karo.
    if (!dismissedRef.current) {
      dismissedRef.current = true;
      markCompanyHydrationSplashSeen(uid);
      setDisplayPct(100);
      window.setTimeout(() => setVisible(false), 320);
    }
  }, [embeddedFullWarm, uid, allCompanies, setGateActive]);

  useEffect(() => {
    if (!visible || !eligible || !embeddedFullWarm) return;
    if (!hydrationDone || warmPhase !== "idle") return;
    if (warmStartedRef.current) return;
    void startEmbeddedWarm();
  }, [visible, eligible, embeddedFullWarm, hydrationDone, warmPhase, startEmbeddedWarm]);

  /** Web: min 2s + hydration — phir mark */
  useEffect(() => {
    if (!visible || !eligible || embeddedFullWarm) return;
    const iv = window.setInterval(() => {
      const start = overlayClockStartRef.current;
      if (start == null || dismissedRef.current) return;
      const elapsed = Date.now() - start;
      const canDismissByTime = elapsed >= MIN_DISPLAY_MS;
      const forceDismiss = elapsed >= FORCE_DONE_MS;
      const readyHydration = hydrationDone || forceDismiss;
      if (!readyHydration) return;
      if (!canDismissByTime && !forceDismiss) return;
      dismissedRef.current = true;
      setDisplayPct(100);
      markCompanyHydrationSplashSeen(uid);
      window.setTimeout(() => setVisible(false), 280);
    }, 140);
    return () => window.clearInterval(iv);
  }, [visible, eligible, embeddedFullWarm, hydrationDone, uid]);

  useEffect(() => {
    return () => {
      warmAbortRef.current?.abort();
      setGateActive(false);
    };
  }, [setGateActive]);

  /** Embedded: top progress bar = overall weighted (data + attach) / 2 for simple single % */
  useEffect(() => {
    if (!visible || !eligible || !embeddedFullWarm || warmPhase === "idle") return;
    const blended = Math.round((overallData + overallAttach) / 2);
    setDisplayPct((p) => (blended > p ? blended : p));
  }, [visible, eligible, embeddedFullWarm, warmPhase, overallData, overallAttach]);

  if (!visible || !eligible) return null;

  const rounded = Math.min(100, Math.max(0, Math.round(displayPct)));

  return (
    <div
      className="fixed inset-0 z-[10050] flex flex-col items-center justify-center bg-background/92 p-6 backdrop-blur-md"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex w-full max-w-md flex-col items-center gap-6 rounded-2xl border border-border bg-card/95 p-8 shadow-lg">
        <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-border bg-muted/40">
          <img
            src="/app-icon.png"
            alt=""
            className="h-full w-full object-contain p-1"
            width={64}
            height={64}
          />
        </div>
        <div className="text-center space-y-1">
          <p className="text-lg font-semibold tracking-tight">
            {embeddedFullWarm ? "Loading your data for offline use" : "Loading your company"}
          </p>
          <p className="text-sm text-muted-foreground break-words min-h-[1.25rem]">
            {displayName ? (
              <span className="font-medium text-foreground">{displayName}</span>
            ) : companyId ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Preparing workspace…
              </span>
            ) : (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Fetching companies…
              </span>
            )}
          </p>
        </div>

        {embeddedFullWarm && warmPhase === "running" && (
          <div className="w-full space-y-4 text-left">
            {waitingOnline && (
              <p className="text-sm text-amber-600 dark:text-amber-400 text-center">
                Waiting for internet…
              </p>
            )}
            {/* Row 1 — is company ka SQLite / Firestore mirror (subcollections) */}
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">
                Data (masters + vouchers)
                {currentWarmCompany?.name ? ` — ${currentWarmCompany.name}` : ""}
              </p>
              <Progress value={currentDataPct} className="h-2" />
              <p className="text-xs tabular-nums text-muted-foreground text-right">{currentDataPct}%</p>
            </div>
            {/* Row 2 — attachment URLs IndexedDB prefetch */}
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">
                Attachments (download & cache)
                {currentWarmCompany?.name ? ` — ${currentWarmCompany.name}` : ""}
              </p>
              <Progress value={currentAttachPct} className="h-2" />
              <p className="text-xs tabular-nums text-muted-foreground text-right">{currentAttachPct}%</p>
            </div>
            {/* Row 3 — saari companies ka average */}
            <div className="space-y-1.5 rounded-lg border border-border/60 bg-muted/30 p-3">
              <p className="text-xs font-semibold text-foreground">All companies (average)</p>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Data {overallData}%</span>
                <span>Attachments {overallAttach}%</span>
              </div>
              <Progress value={Math.round((overallData + overallAttach) / 2)} className="h-2" />
            </div>
            <p className="text-[11px] text-center text-muted-foreground">
              Company {Math.min(warmCompanyIndex + 1, cloudRows.length || 1)} of {cloudRows.length || "—"}
            </p>
          </div>
        )}

        {(!embeddedFullWarm || warmPhase === "idle") && (
          <div className="w-full space-y-2">
            <Progress value={rounded} className="h-2.5" />
            <p className="text-center text-xs font-medium tabular-nums text-muted-foreground">{rounded}%</p>
          </div>
        )}
      </div>
    </div>
  );
}
