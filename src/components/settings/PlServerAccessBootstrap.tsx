"use client";

import { useEffect, useState } from "react";
import { PL_GATE_CHANGED_EVENT } from "@/lib/gates/gateTypes";
import { refreshPlServerAccessContext, readDevClientAccessToken, shouldFetchPlServerAccessContext } from "@/lib/plServerAccessContext";
import { isPlRemoteServerClientMode } from "@/lib/plRemoteServerClient";

/** Remote server client / local_server gate: load token → allowed company ids before company picker. */
export function PlServerAccessBootstrap() {
  const [gateEpoch, setGateEpoch] = useState(0);

  useEffect(() => {
    const bump = () => setGateEpoch((n) => n + 1);
    window.addEventListener(PL_GATE_CHANGED_EVENT, bump);
    return () => window.removeEventListener(PL_GATE_CHANGED_EVENT, bump);
  }, []);

  useEffect(() => {
    if (!shouldFetchPlServerAccessContext()) return;
    if (isPlRemoteServerClientMode() && !readDevClientAccessToken()) return;
    void refreshPlServerAccessContext();
  }, [gateEpoch]);

  return null;
}
