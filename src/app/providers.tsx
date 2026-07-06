
"use client";

import { useEffect } from "react";
import { AuthProvider } from "@/hooks/useAuth";
import { CompanyProvider } from "@/hooks/useCompany";
import { GateProvider } from "@/contexts/GateContext";
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
import { AppUiZoomBootstrap } from "@/components/layout/AppUiZoomBootstrap";
import { VoucherOutboxFlushManager } from "@/components/VoucherOutboxFlushManager";
import { LocalCompanyCloudSyncManager } from "@/components/LocalCompanyCloudSyncManager";
import { CapacitorDriveOAuthReturnHandler } from "@/components/CapacitorDriveOAuthReturnHandler";
import { DriveOAuthReturnBootstrap } from "@/components/DriveOAuthReturnBootstrap";
import { PendingRestoreCloudPushManager } from "@/components/PendingRestoreCloudPushManager";
import { StaticFastResumeSyncManager } from "@/components/StaticFastResumeSyncManager";
import { OnlineResumeRouteShield } from "@/components/OnlineResumeRouteShield";
import { OfflineWarmSyncManager } from "@/components/OfflineWarmSyncManager";
import { CompanyAttachmentOfflineBackfillManager } from "@/components/CompanyAttachmentOfflineBackfillManager";
import { LocalCompanySqliteWarmBootstrap } from "@/components/LocalCompanySqliteWarmBootstrap";
import { LiveMirrorFolderMissingDialog } from "@/components/LiveMirrorFolderMissingDialog";
import { FirstDeviceCompanyHydrationOverlay } from "@/components/FirstDeviceCompanyHydrationOverlay";
import { EmbeddedDeviceLockGate } from "@/components/EmbeddedDeviceLockGate";
import { EmbeddedLogoutProvider } from "@/contexts/EmbeddedLogoutContext";
import { EmbeddedOfflineFirestoreTransport } from "@/components/EmbeddedOfflineFirestoreTransport";
import { FirstLoginWarmGateProvider } from "@/contexts/FirstLoginWarmGateContext";
import { MobileDetailSummaryCollapseProvider } from "@/contexts/MobileDetailSummaryCollapseContext";
import { EmbeddedAttachmentPrefetchProvider } from "@/contexts/EmbeddedAttachmentPrefetchContext";
import { CrossCompanyAttachmentAccessBridge } from "@/components/CrossCompanyAttachmentAccessBridge";
import { ServerShareableCompaniesBridge } from "@/components/ServerShareableCompaniesBridge";
import { PlServerAccessBootstrap } from "@/components/settings/PlServerAccessBootstrap";
import { PlRemoteClientLandingBootstrap } from "@/components/settings/PlRemoteClientLandingBootstrap";
import { PlServerClientMirrorManager } from "@/components/settings/PlServerClientMirrorManager";
import { PlServerLiveSyncManager } from "@/components/settings/PlServerLiveSyncManager";

/** Local-only app start: sql.js init pehle se — refresh par company turant SQLite se load. */
function SqlitePrewarmBootstrap() {
  useEffect(() => {
    void import("@/lib/localSqlite").then((m) => m.getBrowserDb());
  }, []);
  return null;
}
import { PlServerGateLedgerBootstrap } from "@/components/settings/PlServerGateLedgerBootstrap";
import { PlMirrorExportDevBridge } from "@/components/settings/PlMirrorExportDevBridge";
import { PlServerGateRefreshBootstrap } from "@/components/settings/PlServerGateRefreshBootstrap";
import { primeLocalFileRefMetaRuntimeCache } from "@/lib/localPendingFiles";
import { isPerfDebugEnabled } from "@/lib/perfDebug";
import { ensureClientRandomUUIDPolyfill } from "@/lib/clientRandomUUID";

function PresenceManager() {
    usePresence();
    return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
    useEffect(() => {
      ensureClientRandomUUIDPolyfill();
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
            <GateProvider>
            <CompanyProvider>
                <SqlitePrewarmBootstrap />
                <CrossCompanyAttachmentAccessBridge />
                <ServerShareableCompaniesBridge />
                <PlServerAccessBootstrap />
                <PlServerGateRefreshBootstrap />
                <PlRemoteClientLandingBootstrap />
                <PlServerClientMirrorManager />
                <PlServerLiveSyncManager />
                <PlServerGateLedgerBootstrap />
                <PlMirrorExportDevBridge />
                <EmbeddedLogoutProvider>
                <EmbeddedAttachmentPrefetchProvider>
                {/* APK/static pehli login: full warm chalte waqt background warm band — gate overlay set karti hai */}
                <FirstLoginWarmGateProvider>
                <CapacitorAndroidBackButton />
                <AppUiZoomBootstrap />
                <StaticFastResumeSyncManager />
                {/* Offline→online: dashboard/company silent jump block; sync background me chale */}
                <OnlineResumeRouteShield />
                {/* Online par masters/vouchers/plans SQLite + IndexedDB attachments preload */}
                <OfflineWarmSyncManager />
                {/* Online: mirror ki saari attachment URLs IndexedDB/native — offline par open jaisa online */}
                <CompanyAttachmentOfflineBackfillManager />
                <LocalCompanySqliteWarmBootstrap />
                <LiveMirrorFolderMissingDialog />
                <PresenceManager />
                <PrintLogoPreloader />
                <DateProvider>
                    <BalanceModeProvider>
                        <DialogBackHandlerProvider>
                            <VoucherProvider>
                                <VoucherOutboxFlushManager />
                                <LocalCompanyCloudSyncManager />
                                <CapacitorDriveOAuthReturnHandler />
                                <DriveOAuthReturnBootstrap />
                                <PendingRestoreCloudPushManager />
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
                </EmbeddedLogoutProvider>
            </CompanyProvider>
            </GateProvider>
            {/* EXE/APK: Firebase restore ke baad PIN/biometric overlay — Company tree ke upar full-screen */}
            <EmbeddedDeviceLockGate />
        </AuthProvider>
      </ThemeProvider>
    )
}
