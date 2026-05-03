"use client";

/**
 * Naye device pe pehli login: company hydrate tak full-screen % + company naam.
 * Turant ho jaye to bhi minimum ~2s — fir localStorage mark; sirf ek baar uid ke liye.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { Progress } from "@/components/ui/progress";
import { Loader2 } from "lucide-react";
import {
  hasCompanyHydrationSplashBeenSeen,
  markCompanyHydrationSplashSeen,
} from "@/lib/deviceFirstCompanyHydrationSplash";

const MIN_DISPLAY_MS = 2000;
/** Stuck UI trap na ho — max wait */
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

export function FirstDeviceCompanyHydrationOverlay() {
  const pathname = usePathname() || "";
  const { user, loading: authLoading } = useAuth();
  const { companyId, company, allCompanies, loading: registryLoading } = useCompany();

  const uid = user?.uid ?? "";
  const isLoginRoute = pathname === "/" || pathname === "";
  const eligible =
    !!uid && !hasCompanyHydrationSplashBeenSeen(uid) && !authLoading && !isLoginRoute;

  const overlayClockStartRef = useRef<number | null>(null);
  const dismissedRef = useRef(false);
  const [displayPct, setDisplayPct] = useState(0);
  const [visible, setVisible] = useState(false);

  const companyResolvedForSelection = useMemo(() => {
    if (!companyId?.trim()) return true;
    return company != null && company.id === companyId;
  }, [companyId, company]);

  const hydrationDone = !registryLoading && (!companyId || companyResolvedForSelection);

  const displayName =
    (company?.name && company.id === companyId ? company.name : null) ??
    allCompanies.find((c) => c.id === companyId)?.name ??
    "";

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

  /** Progress — milestone cap ki taraf creep */
  useEffect(() => {
    if (!visible || !eligible) return;
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
  }, [visible, eligible, authLoading, registryLoading, companyId, companyResolvedForSelection]);

  /** Min 2s + hydration (ya force timeout) — phir mark + hide */
  useEffect(() => {
    if (!visible || !eligible) return;
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
  }, [visible, eligible, hydrationDone, uid]);

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
          <p className="text-lg font-semibold tracking-tight">Loading your company</p>
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
        <div className="w-full space-y-2">
          <Progress value={rounded} className="h-2.5" />
          <p className="text-center text-xs font-medium tabular-nums text-muted-foreground">{rounded}%</p>
        </div>
      </div>
    </div>
  );
}
