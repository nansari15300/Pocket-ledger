
"use client";

import { useEffect } from "react";
import { AuthProvider } from "@/hooks/useAuth";
import { CompanyProvider } from "@/hooks/useCompany";
import { DateProvider } from "@/hooks/useDate";
import { VoucherProvider } from "@/hooks/useVouchers";
import { BalanceModeProvider } from "@/contexts/BalanceModeContext";
import { DialogBackHandlerProvider } from "@/contexts/DialogBackHandlerContext";
import { FirebaseErrorListener } from "@/components/FirebaseErrorListener";
import { PrintLogoPreloader } from "@/components/PrintLogoPreloader";
import { TooltipProvider } from "@/components/ui/tooltip";
import { usePresence } from "@/hooks/usePresence";
import { ThemeProvider } from "@/hooks/useTheme";
import { CapacitorAndroidBackButton } from "@/components/CapacitorAndroidBackButton";
import { VoucherOutboxFlushManager } from "@/components/VoucherOutboxFlushManager";
import { StaticFastResumeSyncManager } from "@/components/StaticFastResumeSyncManager";
import { OfflineWarmSyncManager } from "@/components/OfflineWarmSyncManager";
import { LiveMirrorFolderMissingDialog } from "@/components/LiveMirrorFolderMissingDialog";
import { FirstDeviceCompanyHydrationOverlay } from "@/components/FirstDeviceCompanyHydrationOverlay";
import { FirstLoginWarmGateProvider } from "@/contexts/FirstLoginWarmGateContext";
import { primeLocalFileRefMetaRuntimeCache } from "@/lib/localPendingFiles";
import { isPerfDebugEnabled } from "@/lib/perfDebug";

function PresenceManager() {
    usePresence();
    return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
    useEffect(() => {
      // Native startup warm: pending local file refs runtime cache prefill so sync fast-path null-hit kam ho.
      void primeLocalFileRefMetaRuntimeCache();
    }, []);
    useEffect(() => {
      if (!isPerfDebugEnabled()) return;
      if (typeof window === "undefined" || typeof PerformanceObserver === "undefined") return;
      // Freeze diagnostics: long tasks (>50ms) console me print karo taaki blocking source correlate ho.
      const obs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration < 40) continue;
          console.warn("[PL-PERF] long-task", {
            durationMs: Math.round(entry.duration * 10) / 10,
            startMs: Math.round(entry.startTime * 10) / 10,
            route: window.location.pathname,
          });
        }
      });
      try {
        obs.observe({ type: "longtask", buffered: true } as PerformanceObserverInit);
      } catch {
        // Browser without longtask support: skip silently.
      }
      return () => obs.disconnect();
    }, []);
    return (
      <ThemeProvider>
        <AuthProvider>
            <FirebaseErrorListener />
            <CompanyProvider>
                {/* APK/static pehli login: full warm chalte waqt background warm band — gate overlay set karti hai */}
                <FirstLoginWarmGateProvider>
                <CapacitorAndroidBackButton />
                <StaticFastResumeSyncManager />
                {/* Online par masters/vouchers/plans SQLite + IndexedDB attachments preload */}
                <OfflineWarmSyncManager />
                <LiveMirrorFolderMissingDialog />
                <PresenceManager />
                <PrintLogoPreloader />
                <DateProvider>
                    <BalanceModeProvider>
                        <DialogBackHandlerProvider>
                            <VoucherProvider>
                                <VoucherOutboxFlushManager />
                                <TooltipProvider>
                                    {children}
                                </TooltipProvider>
                            </VoucherProvider>
                        </DialogBackHandlerProvider>
                    </BalanceModeProvider>
                </DateProvider>
                {/* Pehli device login: web = short hydrate; APK/static = poora data + attachment rows tak */}
                <FirstDeviceCompanyHydrationOverlay />
                </FirstLoginWarmGateProvider>
            </CompanyProvider>
        </AuthProvider>
      </ThemeProvider>
    )
}
