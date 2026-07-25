"use client";

import { useEffect, useRef } from "react";
import { shouldFetchPlServerAccessContext } from "@/lib/plServerAccessContext";
import { isPlServerThinStaffClient } from "@/lib/plServerThinStaffClient";
import { refreshPlServerDisplayCacheCompany, hydratePlServerDisplayCacheFromIdb } from "@/lib/plServerDisplayCache";
import { getPlServerSharedCompanies } from "@/lib/plServerAccessContext";
import { syncPlServerSharedCompaniesToLocalSqlite } from "@/lib/plServerClientCompanyDelta";
import { getActiveGate } from "@/lib/gates/gateStore";
import { isPlServerStaffOnAppUiOrigin } from "@/lib/plGatePageOrigin";
import { isPlServerGateClientActive } from "@/lib/plRemoteServerClient";

/** Gate token add par company shell — thin staff: display cache refresh; legacy: SQLite registry only. */
export function PlServerClientDeltaManager() {
  const ranRef = useRef(false);

  useEffect(() => {
    if (!isPlServerGateClientActive() && !isPlServerStaffOnAppUiOrigin()) return;
    if (!shouldFetchPlServerAccessContext()) return;
    if (ranRef.current) return;
    const gate = getActiveGate();
    const hasServerTransport =
      isPlServerGateClientActive() || (gate.type === "local_server" && Boolean(String(gate.serverUrl || "").trim()));
    if (!hasServerTransport) return;
    ranRef.current = true;

    if (isPlServerThinStaffClient()) {
      void (async () => {
        const shared = getPlServerSharedCompanies();
        for (const row of shared) {
          const id = String(row.id || "").trim();
          if (!id) continue;
          await hydratePlServerDisplayCacheFromIdb(id).catch(() => undefined);
          await refreshPlServerDisplayCacheCompany(id, { pullFullLedger: false }).catch(() => undefined);
        }
      })();
      return;
    }

    void syncPlServerSharedCompaniesToLocalSqlite({ pullFullLedger: false }).catch(() => undefined);
  }, []);

  return null;
}
