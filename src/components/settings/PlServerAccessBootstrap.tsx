"use client";

import { useEffect, useState } from "react";
import { PL_GATE_CHANGED_EVENT } from "@/lib/gates/gateTypes";
import { getElectronLocalServerApi } from "@/lib/electronLocalServer";
import { enablePlGateTrace } from "@/lib/plGateTrace";
import { rememberPlServerPortsFromStatus } from "@/lib/plSharingPortRegistry";
import { refreshPlServerAccessContext, shouldFetchPlServerAccessContext } from "@/lib/plServerAccessContext";
import { purgeOrphanPlServerMirrorCompanies } from "@/lib/plServerGateCleanup";

/** Remote server client / local_server gate: load shared companies before company picker. */
export function PlServerAccessBootstrap() {
  const [gateEpoch, setGateEpoch] = useState(0);

  useEffect(() => {
    enablePlGateTrace(true);
  }, []);

  useEffect(() => {
    void (async () => {
      const api = getElectronLocalServerApi();
      if (!api) return;
      try {
        const status = await api.getStatus();
        rememberPlServerPortsFromStatus(status);
      } catch {
        /* ignore */
      }
    })();
  }, [gateEpoch]);

  useEffect(() => {
    const bump = () => setGateEpoch((n) => n + 1);
    window.addEventListener(PL_GATE_CHANGED_EVENT, bump);
    return () => window.removeEventListener(PL_GATE_CHANGED_EVENT, bump);
  }, []);

  useEffect(() => {
    void purgeOrphanPlServerMirrorCompanies().catch(() => undefined);
    if (!shouldFetchPlServerAccessContext()) return;
    void refreshPlServerAccessContext();
  }, [gateEpoch]);

  return null;
}
