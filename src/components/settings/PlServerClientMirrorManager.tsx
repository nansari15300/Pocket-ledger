"use client";

import { useEffect, useRef } from "react";
import { shouldFetchPlServerAccessContext } from "@/lib/plServerAccessContext";
import { isPlServerThinStaffClient } from "@/lib/plServerThinStaffClient";
import { refreshPlServerDisplayCacheCompany, hydratePlServerDisplayCacheFromIdb } from "@/lib/plServerDisplayCache";
import { getPlServerSharedCompanies } from "@/lib/plServerAccessContext";
import { mirrorPlServerSharedCompaniesToLocalSqlite } from "@/lib/plServerClientCompanyMirror";

/** Gate token add par company shell — thin staff: display cache refresh; legacy: SQLite registry only. */
export function PlServerClientMirrorManager() {
  const ranRef = useRef(false);

  useEffect(() => {
    if (!shouldFetchPlServerAccessContext()) return;
    if (ranRef.current) return;
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

    void mirrorPlServerSharedCompaniesToLocalSqlite({ pullFullLedger: false }).catch(() => undefined);
  }, []);

  return null;
}
