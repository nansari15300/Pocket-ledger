
"use client";

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

function PresenceManager() {
    usePresence();
    return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
    return (
      <ThemeProvider>
        <AuthProvider>
            <FirebaseErrorListener />
            <CompanyProvider>
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
                {/* Pehli device login: company naam + % (min 2s) — localStorage se dubara nahi */}
                <FirstDeviceCompanyHydrationOverlay />
            </CompanyProvider>
        </AuthProvider>
      </ThemeProvider>
    )
}
