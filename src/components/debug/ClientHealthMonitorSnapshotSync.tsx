"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useCompany } from "@/hooks/useCompany";
import { useNavigatorOnline } from "@/hooks/useNavigatorOnline";
import { countSyncOutboxRowsForCompany } from "@/lib/localVoucherOutbox";
import { listCompanyDocsFromBrowserDb } from "@/lib/localCompanyDocMirror";
import {
  isClientHealthMonitorEnabled,
  updateClientHealthMonitorSnapshot,
} from "@/lib/clientHealthMonitor";
import { refreshClientHealthEmergencyOverlayLog } from "@/lib/clientHealthEmergencyOverlay";

/** Company context — snapshot + SQLite/outbox counts (CompanyProvider ke andar). */
export function ClientHealthMonitorSnapshotSync() {
  const [enabled] = useState(() =>
    typeof window !== "undefined" && isClientHealthMonitorEnabled()
  );
  const pathname = usePathname();
  const online = useNavigatorOnline();
  const { companyId, company } = useCompany();

  const refreshHeavyCounts = useCallback(async (cid: string) => {
    try {
      const [outboxPending, vouchers, parties] = await Promise.all([
        countSyncOutboxRowsForCompany(cid).catch(() => null),
        listCompanyDocsFromBrowserDb(cid, "vouchers").then((r) => r.length).catch(() => null),
        listCompanyDocsFromBrowserDb(cid, "parties").then((r) => r.length).catch(() => null),
      ]);
      updateClientHealthMonitorSnapshot({
        outboxPending,
        sqliteVoucherRows: vouchers,
        sqlitePartyRows: parties,
      });
      refreshClientHealthEmergencyOverlayLog();
    } catch {
      /* ignore */
    }
  }, []);

  const pushLightSnapshot = useCallback(() => {
    updateClientHealthMonitorSnapshot({
      companyId: companyId ?? undefined,
      companyName: company?.name ? String(company.name) : undefined,
      route: pathname ?? undefined,
      online,
    });
    refreshClientHealthEmergencyOverlayLog();
    const cid = companyId?.trim();
    if (cid) void refreshHeavyCounts(cid);
  }, [company?.name, companyId, online, pathname, refreshHeavyCounts]);

  useEffect(() => {
    if (!enabled) return;
    pushLightSnapshot();
    const id = window.setInterval(() => pushLightSnapshot(), 45_000);
    return () => window.clearInterval(id);
  }, [enabled, pushLightSnapshot]);

  return null;
}
