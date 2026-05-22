"use client";

import { useEffect, useRef } from "react";
import type { MasterDetailListRouteKey } from "@/lib/masterDetailListPath";
import { masterDetailListHref } from "@/lib/masterDetailListPath";
import { masterDetailRouteKeyFromPath } from "@/lib/masterDetailSidebarNav";

/** Har master-detail route ka apna handler — singleton overwrite (bank) se party detail bigadna band */
const handlersByRoute = new Map<MasterDetailListRouteKey, () => void>();

/** Fallback: handler register na ho to bhi page apna onBackToList chalaye */
export const MASTER_DETAIL_HW_BACK_EVENT = "pl-master-detail-hw-back";

function readSelectedFromLocation(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).has("selected");
}

function listHrefForRoute(routeKey: MasterDetailListRouteKey): string {
  const params = new URLSearchParams(window.location.search);
  const view = params.get("view");
  const base = masterDetailListHref(routeKey);
  // Groups tab detail — list URL me view=groups rakho (party, bank, staff, …)
  if (view === "groups") {
    return `${base}?view=groups`;
  }
  return base;
}

/** true = handler / fallback le consume garyo, router.back() nagaarnu */
export function tryConsumeMasterDetailHardwareBack(): boolean {
  if (typeof window === "undefined") return false;
  const routeKey = masterDetailRouteKeyFromPath(window.location.pathname);
  if (!routeKey) return false;
  // Sirf detail URL (?selected=) — list par hardware back normal history
  if (!readSelectedFromLocation()) return false;

  const handler = handlersByRoute.get(routeKey);
  if (handler) {
    handler();
    return true;
  }

  // Handler miss (race / stale singleton) — URL + event se current route list
  try {
    const href = listHrefForRoute(routeKey);
    window.history.replaceState(window.history.state, "", href);
    window.dispatchEvent(
      new CustomEvent(MASTER_DETAIL_HW_BACK_EVENT, { detail: { routeKey } })
    );
  } catch {
    return false;
  }
  return true;
}

/**
 * Page mount par register — enabled par mat band karo (detail URL par handler miss fix).
 * handler: setSelected(null) + router.replace(masterDetailListHref(...))
 */
export function useRegisterMasterDetailHardwareBack(
  routeKey: MasterDetailListRouteKey,
  handler: () => void,
  /** Optional: jab false ho to sirf event listener off (handler map ma rahega) */
  listenForFallback = true
) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const invoke = () => handlerRef.current();
    handlersByRoute.set(routeKey, invoke);
    return () => {
      if (handlersByRoute.get(routeKey) === invoke) {
        handlersByRoute.delete(routeKey);
      }
    };
  }, [routeKey]);

  useEffect(() => {
    if (!listenForFallback) return;
    const onHwBack = (e: Event) => {
      const ev = e as CustomEvent<{ routeKey?: MasterDetailListRouteKey }>;
      if (ev.detail?.routeKey !== routeKey) return;
      handlerRef.current();
    };
    window.addEventListener(MASTER_DETAIL_HW_BACK_EVENT, onHwBack);
    return () => window.removeEventListener(MASTER_DETAIL_HW_BACK_EVENT, onHwBack);
  }, [routeKey, listenForFallback]);
}
