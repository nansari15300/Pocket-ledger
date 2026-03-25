"use client";

import { useSyncExternalStore } from "react";
import {
  PL_MASTER_DETAIL_HEADER_SYNC,
  readMasterDetailHeaderId,
} from "@/lib/masterDetailHeaderId";

function subscribe(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};
  const fn = () => onStoreChange();
  window.addEventListener(PL_MASTER_DETAIL_HEADER_SYNC, fn);
  return () => window.removeEventListener(PL_MASTER_DETAIL_HEADER_SYNC, fn);
}

/**
 * Reactive read of master-detail id for header (re-renders on sync event from entity pages).
 */
export function useMasterDetailHeaderIdSnapshot(routeKey: string): string | undefined {
  const snap = useSyncExternalStore(
    subscribe,
    () => readMasterDetailHeaderId(routeKey) ?? "",
    () => ""
  );
  return snap || undefined;
}
