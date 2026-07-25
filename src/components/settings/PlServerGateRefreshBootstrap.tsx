"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { activateGate } from "@/lib/gates/gateRuntime";
import { getActiveGate } from "@/lib/gates/gateStore";
import { getLocalCompanyById } from "@/lib/localCompanyStore";
import { isServerGateCompany } from "@/lib/companyStorageKind";
import { getLocalAuthToken, setLocalAuthToken } from "@/lib/localApiClient";
import {
  getPlServerContextGateId,
  isPlServerSharedCompanyRow,
  refreshPlServerAccessContext,
} from "@/lib/plServerAccessContext";
import {
  readAnyStoredOfflineUnlockSessionForCompany,
  readStoredOfflineUnlockSession,
} from "@/lib/offlineCompanyUnlockRemember";
import { readSelectedCompanyId } from "@/lib/selectedCompanyStorage";
import { isPlServerStaffOnAppUiOrigin } from "@/lib/plGatePageOrigin";
import { isPlServerGateClientActive } from "@/lib/plRemoteServerClient";

/** Refresh boot: persisted server-gate company + remembered unlock + gate context restore (CompanySelector mount par depend mat karo). */
export function PlServerGateRefreshBootstrap() {
  const { user } = useAuth();
  const bootAttemptedForRef = useRef<string | null>(null);

  useEffect(() => {
    const companyId = readSelectedCompanyId()?.trim();
    if (!companyId) return;

    const remembered =
      readStoredOfflineUnlockSession(user?.uid, companyId, user?.email) ||
      readAnyStoredOfflineUnlockSessionForCompany(companyId);
    if (remembered && !getLocalAuthToken(companyId)) {
      setLocalAuthToken(companyId, remembered.token, remembered.user);
    }
  }, [user?.uid, user?.email]);

  useEffect(() => {
    if (!isPlServerGateClientActive() && !isPlServerStaffOnAppUiOrigin()) return;
    const companyId = readSelectedCompanyId()?.trim();
    if (!companyId) return;
    if (bootAttemptedForRef.current === companyId) return;
    bootAttemptedForRef.current = companyId;

    void (async () => {
      let isServer = isPlServerSharedCompanyRow({ id: companyId }, null);
      if (!isServer) {
        try {
          const row = await getLocalCompanyById(companyId, { includeDeleted: true });
          isServer = Boolean(row && isServerGateCompany(row));
        } catch {
          isServer = false;
        }
      }
      if (!isServer) return;

      const gateId = getPlServerContextGateId();
      if (gateId) {
        const active = getActiveGate();
        if (active.id !== gateId || active.type !== "local_server") {
          activateGate(gateId);
        }
      }

      await refreshPlServerAccessContext().catch(() => undefined);
    })();
  }, []);

  return null;
}
