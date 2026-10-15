"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useCompany } from "@/hooks/useCompany";
import { useNavigatorOnline } from "@/hooks/useNavigatorOnline";
import { countSyncOutboxRowsForCompany } from "@/lib/localVoucherOutbox";
import { countCompanyDocsInBrowserDb } from "@/lib/localCompanyDocMirror";
import {
  isClientHealthMonitorEnabled,
  updateClientHealthMonitorSnapshot,
} from "@/lib/clientHealthMonitor";
import { refreshClientHealthEmergencyOverlayLog } from "@/lib/clientHealthEmergencyOverlay";

const HEAVY_COUNT_INTERVAL_MS = 120_000;
const HEAVY_COUNT_MIN_GAP_MS = 60_000;

/** Company context — snapshot + cheap SQLite/outbox counts (CompanyProvider ke andar). */
export function ClientHealthMonitorSnapshotSync() {
  const [enabled] = useState(() =>
    typeof window !== "undefined" && isClientHealthMonitorEnabled()
  );
  const pathname = usePathname();
  const online = useNavigatorOnline();
  const { companyId, company } = useCompany();
  const lastHeavyAtRef = useRef(0);

  const refreshHeavyCounts = useCallback(async (cid: string, force = false) => {
    const now = Date.now();
    if (!force && now - lastHeavyAtRef.current < HEAVY_COUNT_MIN_GAP_MS) return;
    lastHeavyAtRef.current = now;
    try {
      // COUNT(*) only — never listCompanyDocsFromBrowserDb (full voucher JSON parse).
      const [outboxPending, vouchers, parties] = await Promise.all([
        countSyncOutboxRowsForCompany(cid).catch(() => null),
        countCompanyDocsInBrowserDb(cid, "vouchers").catch(() => null),
        countCompanyDocsInBrowserDb(cid, "parties").catch(() => null),
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
  }, [company?.name, companyId, online, pathname]);

  useEffect(() => {
    if (!enabled) return;
    pushLightSnapshot();
  }, [enabled, pushLightSnapshot]);

  useEffect(() => {
    if (!enabled) return;
    const cid = companyId?.trim();
    if (!cid) return;
    void refreshHeavyCounts(cid, true);
    const id = window.setInterval(() => {
      void refreshHeavyCounts(cid);
    }, HEAVY_COUNT_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [enabled, companyId, refreshHeavyCounts]);

  return null;
}
