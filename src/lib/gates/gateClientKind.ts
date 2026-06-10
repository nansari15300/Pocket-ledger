"use client";

import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";
import { isElectronDesktopApp } from "@/lib/isElectronDesktop";
import { isStaticAppBuild } from "@/lib/isStaticAppBuild";
import { BUILTIN_DEVICE_GATE_ID, BUILTIN_ONLINE_GATE_ID } from "@/lib/gates/gateTypes";

/** APK / EXE / static bundle — default "This device" gate. */
export function isBundledEmbeddedGateClient(): boolean {
  if (typeof window === "undefined") return false;
  return isStaticAppBuild() || isCapacitorNativeApp() || isElectronDesktopApp();
}

/** Browser web: Online gate. Bundled apps: This device gate. */
export function defaultBuiltinGateId(): string {
  return isBundledEmbeddedGateClient() ? BUILTIN_DEVICE_GATE_ID : BUILTIN_ONLINE_GATE_ID;
}
