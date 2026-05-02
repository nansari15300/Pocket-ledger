"use client";

import { useEffect, useRef } from "react";

/**
 * AddVoucherDialog copy-draft: jab user header company dropdown se save/copy target badle,
 * bill-wise / spend-wise ka local draft turant saaf karo — purane company ke voucher ids UI par na chipke rahein.
 * `copySaveTargetCompanyId` sirf tab pass karo jab `postCopyNewFormSeed` active ho; warna undefined.
 */
export function useResetLinkStateOnCopyTargetCompany(
  copySaveTargetCompanyId: string | undefined,
  reset: () => void
): void {
  const prevRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!copySaveTargetCompanyId) {
      prevRef.current = undefined;
      return;
    }
    if (prevRef.current === undefined) {
      prevRef.current = copySaveTargetCompanyId;
      return;
    }
    if (prevRef.current === copySaveTargetCompanyId) return;
    prevRef.current = copySaveTargetCompanyId;
    reset();
  }, [copySaveTargetCompanyId, reset]);
}
