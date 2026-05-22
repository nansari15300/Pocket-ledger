"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Scale } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { useReconciliationFeature } from "@/hooks/useReconciliationFeature";
import { subscribeLinkedSharesForAccount } from "@/lib/reconciliation/reconciliationStore";
import type { ReconciliationShare } from "@/lib/reconciliation/types";
import { LEDGER_HEADER_PILL_CN } from "@/lib/ledgerHeaderChrome";
import { cn } from "@/lib/utils";
import { RECON_ACCOUNT_BUTTON_LABEL } from "@/lib/reconciliation/labels";

type ReconciliationAccountButtonProps = {
  accountId: string;
  className?: string;
};

/** Account details header — balance ke paas Reconciliation (linked share ho to). */
export function ReconciliationAccountButton({ accountId, className }: ReconciliationAccountButtonProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { companyId } = useCompany();
  const { canView, enabled } = useReconciliationFeature();
  const [links, setLinks] = React.useState<ReconciliationShare[]>([]);

  React.useEffect(() => {
    if (!enabled || !canView || !companyId || !accountId || !user?.uid) {
      setLinks([]);
      return;
    }
    return subscribeLinkedSharesForAccount(companyId, accountId, user.uid, setLinks);
  }, [enabled, canView, companyId, accountId, user?.uid]);

  if (!enabled || !canView || links.length === 0) return null;

  const primary = links[0];

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn(
        /* Ledger header pills — detail/report shared h-7 height */
        LEDGER_HEADER_PILL_CN,
        "whitespace-nowrap",
        className
      )}
      onClick={() => router.push(`/reconciliation/${primary.id}`)}
      title="Compare your ledger with linked remote account"
      data-theme-detail="reconciliation"
    >
      <Scale className="h-3.5 w-3.5 mr-1 shrink-0" />
      {RECON_ACCOUNT_BUTTON_LABEL}
      {links.length > 1 ? ` (${links.length})` : ""}
    </Button>
  );
}
