import { useEffect, useRef } from "react";
import { reconcileTdsLegLinks } from "@/lib/voucherActionsClient";

/**
 * Self-heal on open of a journal / payment: reconcile its TDS-leg links (forward allocation vs reverse mirror on
 * the Sale/Purchase). Orphan mirrors are deleted, missing mirrors recreated; decisions are re-verified against
 * fresh DB rows inside reconcileTdsLegLinks so just-removed links are not resurrected.
 */
export function useHealStaleTdsReverseLinks(
  companyId: string | null | undefined,
  voucherId: string | null | undefined,
  vouchers: any[] | null | undefined
): void {
  const healedRef = useRef<string>("");
  useEffect(() => {
    const jid = String(voucherId ?? "").trim();
    if (!companyId || !jid || !Array.isArray(vouchers) || vouchers.length === 0) return;
    if (!vouchers.some((v) => String(v?.id ?? "") === jid)) return;
    if (healedRef.current === jid) return;
    healedRef.current = jid;
    void reconcileTdsLegLinks(companyId, jid, vouchers).catch((e) =>
      console.warn("[useHealStaleTdsReverseLinks]", e)
    );
  }, [companyId, voucherId, vouchers]);
}