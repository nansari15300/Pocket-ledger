"use client";

import { BUILTIN_ONLINE_GATE_ID } from "@/lib/gates/gateTypes";
import { activateGate } from "@/lib/gates/gateRuntime";

export { isBundledEmbeddedGateClient, defaultBuiltinGateId } from "@/lib/gates/gateClientKind";

/** Online-only app mode: always pin active gate to Online on boot. */
export function ensureWebDefaultOnlineGate(): void {
  if (typeof window === "undefined") return;
  activateGate(BUILTIN_ONLINE_GATE_ID);
}

/** Online-only app mode: company picker always stays on Online gate. */
export function activateOnlineGateForCompanyPicker(): void {
  if (typeof window === "undefined") return;
  activateGate(BUILTIN_ONLINE_GATE_ID);
}
