
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
import { LocalCompanyCloudSyncManager } from "@/components/LocalCompanyCloudSyncManager";
import { StaticFastResumeSyncManager } from "@/components/StaticFastResumeSyncManager";
import { OnlineResumeRouteShield } from "@/components/OnlineResumeRouteShield";
import { OfflineWarmSyncManager } from "@/components/OfflineWarmSyncManager";
import { CompanyAttachmentOfflineBackfillManager } from "@/components/CompanyAttachmentOfflineBackfillManager";
import { LiveMirrorFolderMissingDialog } from "@/components/LiveMirrorFolderMissingDialog";
import { FirstDeviceCompanyHydrationOverlay } from "@/components/FirstDeviceCompanyHydrationOverlay";
import { EmbeddedDeviceLockGate } from "@/components/EmbeddedDeviceLockGate";
import { EmbeddedOfflineFirestoreTransport } from "@/components/EmbeddedOfflineFirestoreTransport";
import { FirstLoginWarmGateProvider } from "@/contexts/FirstLoginWarmGateContext";
import { MobileDetailSummaryCollapseProvider } from "@/contexts/MobileDetailSummaryCollapseContext";
import { EmbeddedAttachmentPrefetchProvider } from "@/contexts/EmbeddedAttachmentPrefetchContext";
import { primeLocalFileRefMetaRuntimeCache } from "@/lib/localPendingFiles";
import { isPerfDebugEnabled } from "@/lib/perfDebug";

function PresenceManager() {
    usePresence();
    return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
    useEffect(() => {
      if (process.env.NODE_ENV !== "production") {
        // Root client mount — agar har navigation par dubara dikhe to remount/root cause alag.
        console.log("[APP_BOOTSTRAP]", "Providers mount (client)");
      }
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
            <EmbeddedOfflineFirestoreTransport />
            <CompanyProvider>
                <EmbeddedAttachmentPrefetchProvider>
                {/* APK/static pehli login: full warm chalte waqt background warm band — gate overlay set karti hai */}
                <FirstLoginWarmGateProvider>
                <CapacitorAndroidBackButton />
                <StaticFastResumeSyncManager />
                {/* Offline→online: dashboard/company silent jump block; sync background me chale */}
                <OnlineResumeRouteShield />
                {/* Online par masters/vouchers/plans SQLite + IndexedDB attachments preload */}
                <OfflineWarmSyncManager />
                {/* Online: mirror ki saari attachment URLs IndexedDB/native — offline par open jaisa online */}
                <CompanyAttachmentOfflineBackfillManager />
                <LiveMirrorFolderMissingDialog />
                <PresenceManager />
                <PrintLogoPreloader />
                <DateProvider>
                    <BalanceModeProvider>
                        <DialogBackHandlerProvider>
                            <VoucherProvider>
                                <VoucherOutboxFlushManager />
                                <LocalCompanyCloudSyncManager />
                                <TooltipProvider>
                                    <MobileDetailSummaryCollapseProvider>
                                      {children}
                                    </MobileDetailSummaryCollapseProvider>
                                </TooltipProvider>
                            </VoucherProvider>
                        </DialogBackHandlerProvider>
                    </BalanceModeProvider>
                </DateProvider>
                {/* Pehli device login: web = short hydrate; APK/static = data mirror splash + background attachment cache */}
                <FirstDeviceCompanyHydrationOverlay />
                </FirstLoginWarmGateProvider>
                </EmbeddedAttachmentPrefetchProvider>
            </CompanyProvider>
            {/* EXE/APK: Firebase restore ke baad PIN/biometric overlay — Company tree ke upar full-screen */}
            <EmbeddedDeviceLockGate />
        </AuthProvider>
      </ThemeProvider>
    )
}
