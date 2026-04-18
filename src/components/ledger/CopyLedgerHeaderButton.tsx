"use client";

import * as React from "react";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { useCompany } from "@/hooks/useCompany";
import usePermissions from "@/hooks/usePermissions";
import { CopyLedgerDialog } from "@/components/ledger/CopyLedgerDialog";
import { RefreshCw } from "lucide-react";

/** Setting ON + permission — hover preview switch ke baayein (code order me pehle) */
export function CopyLedgerHeaderButton() {
  const [open, setOpen] = React.useState(false);
  const { company } = useCompany();
  const { can } = usePermissions();
  if (!can("copy_ledger_cross_company") || company?.enableCrossCompanyLedgerCopy !== true) return null;
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
