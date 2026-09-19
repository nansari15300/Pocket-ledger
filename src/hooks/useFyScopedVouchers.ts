"use client";

import { useMemo } from "react";
import { useVouchers } from "@/hooks/useVouchers";
import { useFyVoucherScope } from "@/contexts/FyVoucherScopeContext";
import {
  filterVouchersToFyScope,
  mergeVouchersById,
} from "@/lib/fyPagination/scopeFilter";

/**
 * Voucher context with FY/month scope applied (dashboard, reports, link dialogs).
 * When scope is off, behaves like `useVouchers`.
 */
export function useFyScopedVouchers() {
  const base = useVouchers();
  const fy = useFyVoucherScope();

  const scopedVouchers = useMemo(() => {
    if (!fy.enabled || !fy.activeScope) {
      return base.vouchers;
    }
    const merged = mergeVouchersById(base.vouchers || [], fy.hydratedVouchers || []);
    return filterVouchersToFyScope(merged, fy.activeScope, fy.loadedRanges, fy.scopedVoucherIds);
  }, [
    base.vouchers,
    fy.enabled,
    fy.activeScope,
    fy.loadedRanges,
    fy.hydratedVouchers,
    fy.scopedVoucherIds,
  ]);

  const scopedVouchersAll = useMemo(() => {
    if (!fy.enabled || !fy.activeScope) {
      return base.vouchersAll?.length ? base.vouchersAll : base.vouchers;
    }
    const allBase = base.vouchersAll?.length ? base.vouchersAll : base.vouchers || [];
    const merged = mergeVouchersById(allBase, fy.hydratedVouchers || []);
    return filterVouchersToFyScope(merged, fy.activeScope, fy.loadedRanges, fy.scopedVoucherIds);
  }, [
    base.vouchers,
    base.vouchersAll,
    fy.enabled,
    fy.activeScope,
    fy.loadedRanges,
    fy.hydratedVouchers,
    fy.scopedVoucherIds,
  ]);

  return {
    ...base,
    vouchers: scopedVouchers,
    vouchersAll: scopedVouchersAll,
    fyActiveScope: fy.activeScope,
    fyOpeningBalances: fy.openingBalances,
    fyScopeEnabled: fy.enabled,
    requestFyLoadRange: fy.requestLoadRange,
    requestFyLoadFyKey: fy.requestLoadFyKey,
  };
}
