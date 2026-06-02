"use client";

import { useCallback, useEffect, type MutableRefObject } from "react";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import {
  buildModalRepairHref,
  persistPlModalParentQuery,
} from "@/lib/modalUrlSync";

type UseMobileLedgerModalUrlGuardParams = {
  isMobile: boolean;
  modalParam: string | null;
  /** Voucher / calendar / note / history — koi bhi mobile overlay open ho. */
  anyPopupOpen: boolean;
  openingModalRef: MutableRefObject<boolean>;
  pathname: string | null;
  /** Next `useSearchParams` ya `useLocationSearchParams` — dono `.toString()` dete hain. */
  searchParams: { toString(): string };
  router: AppRouterInstance;
};

/**
 * Mobile ledger: `?modal=1` URL sync — pehle modal drop hone par popup force-close hota tha (~30s canonical `router.replace`).
 * Ab URL repair: voucher/dialog tab tak open jab tak user khud band na kare.
 */
export function useMobileLedgerModalUrlGuard(params: UseMobileLedgerModalUrlGuardParams): void {
  const {
    isMobile,
    modalParam,
    anyPopupOpen,
    openingModalRef,
    pathname,
    searchParams,
    router,
  } = params;

  const repairModalInUrl = useCallback(() => {
    if (!isMobile || !pathname) return;
    persistPlModalParentQuery(searchParams.toString());
    const href = buildModalRepairHref(pathname, searchParams.toString());
    router.replace(href, { scroll: false });
  }, [isMobile, pathname, searchParams, router]);

  useEffect(() => {
    if (!isMobile) return;
    if (modalParam === "1") openingModalRef.current = false;
    if (modalParam !== "1" && anyPopupOpen && !openingModalRef.current) {
      repairModalInUrl();
    }
  }, [isMobile, modalParam, anyPopupOpen, openingModalRef, repairModalInUrl]);
}
