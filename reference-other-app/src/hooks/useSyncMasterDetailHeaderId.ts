"use client";

import { useEffect } from "react";
import { writeMasterDetailHeaderId } from "@/lib/masterDetailHeaderId";

/**
 * Keep sessionStorage in sync with current master-detail selection (party, bank, …)
 * so DesktopAppHeader Report buttons survive transient URL param loss.
 */
export function useSyncMasterDetailHeaderId(routeKey: string, selectedId: string | null | undefined): void {
  useEffect(() => {
    writeMasterDetailHeaderId(routeKey, selectedId ?? null);
  }, [routeKey, selectedId]);
}
