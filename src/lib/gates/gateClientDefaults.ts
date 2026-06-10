"use client";

import { BUILTIN_DEVICE_GATE_ID, BUILTIN_ONLINE_GATE_ID } from "@/lib/gates/gateTypes";
import { activateGate } from "@/lib/gates/gateRuntime";
import { getActiveGate, getGateById, readActiveGateId } from "@/lib/gates/gateStore";
import { isBundledEmbeddedGateClient } from "@/lib/gates/gateClientKind";

export { isBundledEmbeddedGateClient, defaultBuiltinGateId } from "@/lib/gates/gateClientKind";

const WEB_ONLINE_GATE_MIGRATED_KEY = "pl_web_default_online_gate_v1";

/**
 * Web browser: Firebase/online companies ke liye Online gate default.
 * Bundled apps par device gate rehta hai.
 */
export function ensureWebDefaultOnlineGate(): void {
  if (typeof window === "undefined" || isBundledEmbeddedGateClient()) return;

  const activeId = readActiveGateId();
  if (!activeId) {
    activateGate(BUILTIN_ONLINE_GATE_ID);
    return;
  }

  const gate = getGateById(activeId);
  if (gate?.type === "local_server") return;

  if (activeId === BUILTIN_DEVICE_GATE_ID && !localStorage.getItem(WEB_ONLINE_GATE_MIGRATED_KEY)) {
    activateGate(BUILTIN_ONLINE_GATE_ID);
    localStorage.setItem(WEB_ONLINE_GATE_MIGRATED_KEY, "1");
  }
}

/** Company picker / switch company: web par Online gate taaki local-only list na dikhe. */
export function activateOnlineGateForCompanyPicker(): void {
  if (typeof window === "undefined" || isBundledEmbeddedGateClient()) return;
  const gate = getActiveGate();
  if (gate.type === "local_server") return;
  if (gate.id === BUILTIN_ONLINE_GATE_ID) return;
  activateGate(BUILTIN_ONLINE_GATE_ID);
}
