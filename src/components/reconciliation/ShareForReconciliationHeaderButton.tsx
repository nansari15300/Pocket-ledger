"use client";

import * as React from "react";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Scale } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useReconciliationFeature } from "@/hooks/useReconciliationFeature";
import { useCompany } from "@/hooks/useCompany";
import { subscribeReconciliationSharesForViewer } from "@/lib/reconciliation/reconciliationStore";
import { ShareForReconciliationDialog } from "@/components/reconciliation/ShareForReconciliationDialog";
import { RECON_SHARE_HEADER_LABEL } from "@/lib/reconciliation/labels";
import {
  OPEN_RECON_SHARE_DIALOG_EVENT,
  type OpenReconShareDialogDetail,
} from "@/lib/reconciliation/openShareDialog";
import { useCompanyVoucherFeatureSettings } from "@/hooks/useCompanyVoucherFeatureSettings";
import { logHeaderFeatureButtonFlip } from "@/lib/companyOnlinePlFlipTrace";

/** Header button — plan + company setting + share permission. */
export function ShareForReconciliationHeaderButton() {
  const [open, setOpen] = React.useState(false);
  const [openDetail, setOpenDetail] = React.useState<OpenReconShareDialogDetail>({});
  const { user } = useAuth();
  const { companyId, company } = useCompany();
  const { canShare, canLink, canView, canViewSharedList, canViewUnlinkedList, enabled } = useReconciliationFeature();
  const { enableCrossCompanyLedgerCopy, enableShareForReconciliation } = useCompanyVoucherFeatureSettings();
  const [pendingIncoming, setPendingIncoming] = React.useState(0);
  const prevEnabledRef = React.useRef<boolean | null>(null);
  React.useEffect(() => {
    if (prevEnabledRef.current === enabled) return;
    if (prevEnabledRef.current != null) {
      logHeaderFeatureButtonFlip({
        companyId,
        syncLedgerVisible: enableCrossCompanyLedgerCopy === true,
        shareReconVisible: enabled,
        enableCrossCompanyLedgerCopy,
        enableShareForReconciliation,
        storageOption: company?.storageOption,
        plServerShared: (company as { plServerShared?: boolean } | null)?.plServerShared === true,
        syncedFromCloud: (company as { syncedFromCloud?: boolean } | null)?.syncedFromCloud === true,
      });
    }
    prevEnabledRef.current = enabled;
  }, [
    enabled,
    companyId,
    company?.storageOption,
    (company as { plServerShared?: boolean } | null)?.plServerShared,
    (company as { syncedFromCloud?: boolean } | null)?.syncedFromCloud,
    enableCrossCompanyLedgerCopy,
    enableShareForReconciliation,
  ]);

  React.useEffect(() => {
    if (!user?.uid || !enabled) {
      setPendingIncoming(0);
      return;
    }
    return subscribeReconciliationSharesForViewer(user.uid, companyId ?? undefined, (rows) => {
      setPendingIncoming(rows.filter((s) => s.targetUserId === user.uid && s.status === "pending").length);
    });
  }, [user?.uid, companyId, enabled]);

  /** Chat / alerts se dialog — Shared list + card highlight */
  React.useEffect(() => {
    const onOpenFromEvent = (event: Event) => {
      const detail = (event as CustomEvent<OpenReconShareDialogDetail>).detail || {};
      setOpenDetail(detail);
      setOpen(true);
    };
    document.addEventListener(OPEN_RECON_SHARE_DIALOG_EVENT, onOpenFromEvent);
    return () => document.removeEventListener(OPEN_RECON_SHARE_DIALOG_EVENT, onOpenFromEvent);
  }, []);

  if (!enabled) return null;

  const showButton =
    canShare ||
    canLink ||
    canView ||
    canViewSharedList ||
    canViewUnlinkedList ||
    pendingIncoming > 0;

  return (
    <Suspense fallback={null}>
      {showButton ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="relative shrink-0 h-8 text-xs px-2"
          onClick={() => {
            setOpenDetail({});
            setOpen(true);
          }}
          title="Share account ledger for reconciling with another user"
        >
          <Scale className="h-3.5 w-3.5 mr-1 shrink-0" />
          {RECON_SHARE_HEADER_LABEL}
          {pendingIncoming > 0 ? (
            <Badge variant="destructive" className="ml-1 h-4 min-w-4 px-1 text-[10px]">{pendingIncoming}</Badge>
          ) : null}
        </Button>
      ) : null}
      <ShareForReconciliationDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setOpenDetail({});
        }}
        initialTab={openDetail.tab}
        highlightShareId={openDetail.highlightShareId ?? null}
      />
    </Suspense>
  );
}
