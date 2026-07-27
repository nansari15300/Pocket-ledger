"use client";

import * as React from "react";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import usePermissions from "@/hooks/usePermissions";
import { useCompany } from "@/hooks/useCompany";
import { useCompanyVoucherFeatureSettings } from "@/hooks/useCompanyVoucherFeatureSettings";
import { CopyLedgerDialog } from "@/components/ledger/CopyLedgerDialog";
import { RefreshCw } from "lucide-react";
import { logHeaderFeatureButtonFlip } from "@/lib/companyOnlinePlFlipTrace";

/** Setting ON + permission — hover preview switch ke baayein (code order me pehle) */
export function CopyLedgerHeaderButton() {
  const [open, setOpen] = React.useState(false);
  const { can } = usePermissions();
  const { company, companyId } = useCompany();
  const { enableCrossCompanyLedgerCopy, enableShareForReconciliation } = useCompanyVoucherFeatureSettings();
  const visible = can("copy_ledger_cross_company") && enableCrossCompanyLedgerCopy === true;
  const prevVisibleRef = React.useRef<boolean | null>(null);
  React.useEffect(() => {
    if (prevVisibleRef.current === visible) return;
    if (prevVisibleRef.current != null) {
      logHeaderFeatureButtonFlip({
        companyId,
        syncLedgerVisible: visible,
        shareReconVisible: enableShareForReconciliation === true,
        enableCrossCompanyLedgerCopy,
        enableShareForReconciliation,
        storageOption: company?.storageOption,
        plServerShared: (company as { plServerShared?: boolean } | null)?.plServerShared === true,
        syncedFromCloud: (company as { syncedFromCloud?: boolean } | null)?.syncedFromCloud === true,
      });
    }
    prevVisibleRef.current = visible;
  }, [
    visible,
    companyId,
    company?.storageOption,
    (company as { plServerShared?: boolean } | null)?.plServerShared,
    (company as { syncedFromCloud?: boolean } | null)?.syncedFromCloud,
    enableCrossCompanyLedgerCopy,
    enableShareForReconciliation,
  ]);
  if (!visible) return null;
  return (
    <Suspense fallback={null}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="shrink-0 h-8 text-xs px-2"
        onClick={() => setOpen(true)}
        // Header wording sync: user-facing action name is now "Sync ledger".
        title="Sync party ledger to another company"
      >
        <RefreshCw className="h-3.5 w-3.5 mr-1 shrink-0" />
        Sync ledger
      </Button>
      <CopyLedgerDialog open={open} onOpenChange={setOpen} />
    </Suspense>
  );
}
