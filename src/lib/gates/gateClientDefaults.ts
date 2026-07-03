"use client";

import { BUILTIN_ONLINE_GATE_ID } from "@/lib/gates/gateTypes";
import { activateGate } from "@/lib/gates/gateRuntime";
import { defaultBuiltinGateId } from "@/lib/gates/gateClientKind";
import { getActiveGate, readActiveGateId } from "@/lib/gates/gateStore";

export { isBundledEmbeddedGateClient, defaultBuiltinGateId } from "@/lib/gates/gateClientKind";

/** Boot: saved gate restore karo; pehli baar default Online. */
export function ensureWebDefaultOnlineGate(): void {
  if (typeof window === "undefined") return;
  const saved = readActiveGateId();
  if (saved) {
    activateGate(saved);
    return;
  }
  activateGate(defaultBuiltinGateId());
}

/** Company picker: local_server gate mat hatao — server tab companies dikhein. */
export function activateOnlineGateForCompanyPicker(): void {
  if (typeof window === "undefined") return;
  const active = getActiveGate();
  if (active.type === "local_server") return;
  activateGate(BUILTIN_ONLINE_GATE_ID);
}
