"use client";

import { useEffect } from "react";
import { useCompany } from "@/hooks/useCompany";
import { useVouchers } from "@/hooks/useVouchers";
import { VOUCHER_ATTACHMENT_SAVED_EVENT } from "@/lib/voucherFormAttachmentSave";
import { scheduleFySnapshotRebuildAfterVoucherSave } from "@/lib/fyPagination/voucherSaveHooks";

/** Rebuild FY/month snapshots after voucher save (back-date parity). */
export function FySnapshotSaveBootstrap() {
  const { company } = useCompany();
  const { vouchers } = useVouchers();

  useEffect(() => {
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as {
        companyId?: string;
        voucherId?: string;
        patch?: Record<string, unknown>;
      };
      const companyId = String(detail?.companyId || "").trim();
      const voucherId = String(detail?.voucherId || "").trim();
      if (!companyId || !voucherId || !company?.id || companyId !== company.id) return;

      const fromPatch = detail.patch && typeof detail.patch === "object" ? detail.patch : null;
      const fromList = (vouchers || []).find((v) => String(v.id || "") === voucherId);
      const voucher = { ...(fromList || {}), ...(fromPatch || {}), id: voucherId };
      void scheduleFySnapshotRebuildAfterVoucherSave({
        company,
        voucher,
        vouchersInMemory: vouchers || [],
      }).catch((err) => {
        console.warn("[FySnapshotSaveBootstrap] snapshot rebuild", err);
      });
    };

    window.addEventListener(VOUCHER_ATTACHMENT_SAVED_EVENT, handler);
    return () => window.removeEventListener(VOUCHER_ATTACHMENT_SAVED_EVENT, handler);
  }, [company, vouchers]);

  return null;
}
