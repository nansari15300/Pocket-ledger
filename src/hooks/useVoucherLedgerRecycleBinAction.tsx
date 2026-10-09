"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import usePermissions from "@/hooks/usePermissions";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { softDeleteVoucherMoveToRecycleBin } from "@/lib/voucherActionsClient";
import { dispatchVoucherLivePatch } from "@/lib/voucherFormAttachmentSave";
import { VoucherDeleteConfirmAlertDialog } from "@/components/vouchers/VoucherDeleteConfirmAlertDialog";
import { FISCAL_YEAR_PARTITION_ROW_TYPE } from "@/lib/fiscalPartitionRows";
import { FY_OPENING_ROW_TYPE } from "@/lib/fyPagination/fyOpeningRows";

function isLedgerRecycleBinRow(transaction: { type?: string; id?: string } | null | undefined): boolean {
  if (!transaction?.id) return false;
  const type = String(transaction.type || "");
  if (type === FISCAL_YEAR_PARTITION_ROW_TYPE || type === FY_OPENING_ROW_TYPE) return false;
  return true;
}

/** Ledger / Recent row → recycle bin (master missing corrupt vouchers ke liye bhi — sirf voucher id chahiye). */
export function useVoucherLedgerRecycleBinAction() {
  const { companyId } = useCompany();
  const { user } = useAuth();
  const { canDeleteVoucher } = usePermissions();
  const [pending, setPending] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);

  const canMoveToRecycleBin = useCallback(
    (transaction: { isApproved?: boolean; type?: string; id?: string } | null | undefined) =>
      isLedgerRecycleBinRow(transaction) && canDeleteVoucher(transaction),
    [canDeleteVoucher]
  );

  const requestMoveToRecycleBin = useCallback(
    (transaction: Record<string, unknown>) => {
      if (!canMoveToRecycleBin(transaction)) {
        toast.error("Cannot move to recycle bin", {
          description: "Missing permission or this row cannot be deleted from here.",
        });
        return;
      }
      setPending(transaction);
    },
    [canMoveToRecycleBin]
  );

  const handleMoveToBin = useCallback(async () => {
    const vid = String(pending?.id || "").trim();
    if (!vid || !companyId) return;
    setBusy(true);
    try {
      await softDeleteVoucherMoveToRecycleBin(companyId, vid, user?.uid || "");
      dispatchVoucherLivePatch(companyId, vid, { isDeleted: true, id: vid });
      toast.success("Voucher moved to recycle bin.");
      setPending(null);
    } catch (e) {
      toast.error("Could not move voucher to recycle bin.", {
        description: e instanceof Error ? e.message : String(e ?? ""),
      });
    } finally {
      setBusy(false);
    }
  }, [companyId, pending?.id, user?.uid]);

  const recycleBinConfirmDialog = (
    <VoucherDeleteConfirmAlertDialog
      open={!!pending}
      onOpenChange={(open) => {
        if (!open && !busy) setPending(null);
      }}
      entityName={
        String(pending?.voucherNumber || "").trim() ||
        String(pending?.id || "").trim() ||
        "Voucher"
      }
      description={
        <>
          This moves the voucher to the recycle bin. Missing party/account data does not block
          delete — only the voucher record is removed from the ledger.
        </>
      }
      onMoveToBin={handleMoveToBin}
      busy={busy}
    />
  );

  return {
    canMoveToRecycleBin,
    requestMoveToRecycleBin,
    recycleBinConfirmDialog,
  };
}
