"use client";

import { useCallback, useState } from "react";
import { InterCompanyLedgerChangeDetectDialog } from "@/components/inter-company/InterCompanyLedgerChangeDetectDialog";

/** Ledger / daybook / recent — IC row “Change Detected” badge: popup only, no voucher form. */
export function useInterCompanyLedgerChangeDetectDialog(onApplied?: () => void) {
  const [icChangeDetectVoucher, setIcChangeDetectVoucher] = useState<Record<string, unknown> | null>(null);

  const handleInterCompanyChangeDetectedClick = useCallback((voucher: unknown) => {
    setIcChangeDetectVoucher(voucher as Record<string, unknown>);
  }, []);

  const interCompanyChangeDetectDialog = (
    <InterCompanyLedgerChangeDetectDialog
      open={!!icChangeDetectVoucher}
      onOpenChange={(open) => {
        if (!open) setIcChangeDetectVoucher(null);
      }}
      voucher={icChangeDetectVoucher}
      onApplied={onApplied}
    />
  );

  return { handleInterCompanyChangeDetectedClick, interCompanyChangeDetectDialog };
}
