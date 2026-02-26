
"use client";

import { AuthProvider } from "@/hooks/useAuth";
import { CompanyProvider } from "@/hooks/useCompany";
import { DateProvider } from "@/hooks/useDate";
import { VoucherProvider } from "@/hooks/useVouchers";
import { BalanceModeProvider } from "@/contexts/BalanceModeContext";
import { FirebaseErrorListener } from "@/components/FirebaseErrorListener";
import { PrintLogoPreloader } from "@/components/PrintLogoPreloader";
import { TooltipProvider } from "@/components/ui/tooltip";
import { usePresence } from "@/hooks/usePresence";
import { ThemeProvider } from "@/hooks/useTheme";

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
                <PresenceManager />
                <PrintLogoPreloader />
                <DateProvider>
                    <BalanceModeProvider>
                        <VoucherProvider>
                            <TooltipProvider>
                                {children}
                            </TooltipProvider>
                        </VoucherProvider>
                    </BalanceModeProvider>
                </DateProvider>
            </CompanyProvider>
        </AuthProvider>
      </ThemeProvider>
    )
}
