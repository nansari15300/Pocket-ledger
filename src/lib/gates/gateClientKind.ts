"use client";

import { BUILTIN_ONLINE_GATE_ID } from "@/lib/gates/gateTypes";

/** APK / EXE / static bundle — default "This device" gate. */
export function isBundledEmbeddedGateClient(): boolean {
  // Online-only app mode: gate client kind no longer branches by platform.
  return false;
}

/** Browser web: Online gate. Bundled apps: This device gate. */
export function defaultBuiltinGateId(): string {
  // Online-only app mode: always boot on Online gate (web/EXE/APK).
  return BUILTIN_ONLINE_GATE_ID;
}
