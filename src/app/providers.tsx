
"use client";

import { AuthProvider } from "@/hooks/useAuth";
import { CompanyProvider } from "@/hooks/useCompany";
import { DateProvider } from "@/hooks/useDate";
import { VoucherProvider } from "@/hooks/useVouchers";
import { BalanceModeProvider } from "@/contexts/BalanceModeContext";
<<<<<<< HEAD
import { OfflineGraceProvider } from "@/contexts/OfflineGraceContext";
=======
import { DialogBackHandlerProvider } from "@/contexts/DialogBackHandlerContext";
>>>>>>> 6a1ec26 (Animation Fixed)
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
<<<<<<< HEAD
        <OfflineGraceProvider>
=======
>>>>>>> 6a1ec26 (Animation Fixed)
        <AuthProvider>
            <FirebaseErrorListener />
            <CompanyProvider>
                <PresenceManager />
                <PrintLogoPreloader />
                <DateProvider>
                    <BalanceModeProvider>
<<<<<<< HEAD
                        <VoucherProvider>
                            <TooltipProvider>
                                {children}
                            </TooltipProvider>
                        </VoucherProvider>
=======
                        <DialogBackHandlerProvider>
                            <VoucherProvider>
                                <TooltipProvider>
                                    {children}
                                </TooltipProvider>
                            </VoucherProvider>
                        </DialogBackHandlerProvider>
>>>>>>> 6a1ec26 (Animation Fixed)
                    </BalanceModeProvider>
                </DateProvider>
            </CompanyProvider>
        </AuthProvider>
<<<<<<< HEAD
        </OfflineGraceProvider>
=======
>>>>>>> 6a1ec26 (Animation Fixed)
      </ThemeProvider>
    )
}
