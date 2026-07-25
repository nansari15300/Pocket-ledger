"use client";

import { useEffect, useRef } from "react";
import { PL_GATE_CHANGED_EVENT } from "@/lib/gates/gateTypes";
import { activateGate } from "@/lib/gates/gateRuntime";
import { ensureSharingPortLocalServerGate } from "@/lib/gates/gateStore";
import { refreshPlServerAccessContext } from "@/lib/plServerAccessContext";
import { readAndStripPlGateLandingQuery, isAppUiOrigin } from "@/lib/plGatePageOrigin";
import { isPlSharingServerPortOrigin } from "@/lib/plRemoteServerClient";

/**
 * Hub (:3000) → Open gate → sharing URL (:3001): gate id URL se is origin ke localStorage me save.
 * Company selector / Gate page par server URL dubara type na karna pade — web, EXE, APK same.
 */
export function PlServerGateLandingBootstrap() {
  const appliedRef = useRef(false);

  useEffect(() => {
    if (appliedRef.current || typeof window === "undefined") return;

    const onSharingPort = isPlSharingServerPortOrigin();
    const landing = readAndStripPlGateLandingQuery();
    const hasLandingParams = Boolean(landing.gateId || landing.serverUrl);

    if (!onSharingPort && !hasLandingParams) return;
    if (isAppUiOrigin() && !onSharingPort && !hasLandingParams) return;

    appliedRef.current = true;

    const gate = ensureSharingPortLocalServerGate({
      id: landing.gateId,
      label: landing.gateLabel,
      serverUrl: landing.serverUrl,
    });
    if (!gate) return;

    activateGate(gate.id);
    window.dispatchEvent(new Event(PL_GATE_CHANGED_EVENT));
    void refreshPlServerAccessContext();
  }, []);

  return null;
}
