"use client";

import { useCallback, useEffect, useState } from "react";
import {
  PL_CLIENT_HEALTH_ALERT_EVENT,
  PL_CLIENT_HEALTH_LOG_EVENT,
  PL_UI_HEALTH_EMERGENCY_OVERLAY_MIN_VISIBLE_MS,
  isClientHealthMonitorEnabled,
  releaseClientHealthEmergencyBrake,
  startClientHealthMonitor,
} from "@/lib/clientHealthMonitor";
import {
  canDismissClientHealthEmergencyOverlay,
  hideClientHealthEmergencyOverlay,
  refreshClientHealthEmergencyOverlayLog,
  showClientHealthEmergencyOverlay,
} from "@/lib/clientHealthEmergencyOverlay";

/**
 * Global — AuthProvider ke andar, deferred shell se pehle.
 * React hydrate se pehle early script ne ring/overlay shuru kar diya hota hai.
 */
export function ClientHealthGlobalBootstrap() {
  const [enabled] = useState(() =>
    typeof window !== "undefined" && isClientHealthMonitorEnabled()
  );

  const syncOverlayLog = useCallback(() => {
    refreshClientHealthEmergencyOverlayLog();
  }, []);

  useEffect(() => {
    if (!enabled) return;
    (window as unknown as { __PL_UI_HEALTH_BRAKE_RELEASE__?: () => void }).__PL_UI_HEALTH_BRAKE_RELEASE__ =
      () => {
        hideClientHealthEmergencyOverlay();
        releaseClientHealthEmergencyBrake();
      };
    const stop = startClientHealthMonitor();
    if (document.getElementById("pl-ui-health-emergency-overlay")) {
      syncOverlayLog();
    }
    return stop;
  }, [enabled, syncOverlayLog]);

  useEffect(() => {
    if (!enabled) return;
    const onAlert = () => {
      if (document.getElementById("pl-ui-health-emergency-overlay")) {
        syncOverlayLog();
      }
    };
    window.addEventListener(PL_CLIENT_HEALTH_ALERT_EVENT, onAlert);
    return () => window.removeEventListener(PL_CLIENT_HEALTH_ALERT_EVENT, onAlert);
  }, [enabled, syncOverlayLog]);

  useEffect(() => {
    if (!enabled) return;
    const onKey = (ev: KeyboardEvent) => {
      if (!ev.ctrlKey || !ev.shiftKey || ev.key.toLowerCase() !== "u") return;
      ev.preventDefault();
      const reason = "Manual UI health diary (Ctrl+Shift+U)";
      showClientHealthEmergencyOverlay(
        reason,
        () => {
          if (!canDismissClientHealthEmergencyOverlay()) return;
          hideClientHealthEmergencyOverlay();
          releaseClientHealthEmergencyBrake();
        },
        { minVisibleMs: PL_UI_HEALTH_EMERGENCY_OVERLAY_MIN_VISIBLE_MS }
      );
      refreshClientHealthEmergencyOverlayLog();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const onRing = () => {
      if (document.getElementById("pl-ui-health-emergency-overlay")) {
        refreshClientHealthEmergencyOverlayLog();
      }
    };
    window.addEventListener(PL_CLIENT_HEALTH_LOG_EVENT, onRing);
    return () => window.removeEventListener(PL_CLIENT_HEALTH_LOG_EVENT, onRing);
  }, [enabled]);

  return null;
}
