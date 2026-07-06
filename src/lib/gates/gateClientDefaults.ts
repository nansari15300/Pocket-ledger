"use client";

import { BUILTIN_ONLINE_GATE_ID } from "@/lib/gates/gateTypes";
import { activateGate } from "@/lib/gates/gateRuntime";
import { defaultBuiltinGateId } from "@/lib/gates/gateClientKind";
import { readActiveGateId } from "@/lib/gates/gateStore";

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

/** Company picker: hamesha Online gate — local/server gate se online companies hide na hon. */
export function activateOnlineGateForCompanyPicker(): void {
  if (typeof window === "undefined") return;
  activateGate(BUILTIN_ONLINE_GATE_ID);
}
