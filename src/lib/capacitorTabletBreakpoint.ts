import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";

/**
 * Capacitor APK: chhoti screen (~normal phone) vs tablet / bada phone (~5"+ smallest side).
 * Browser `screen` CSS px — literal inch nahi, lekin min side ~560px ≈ 5–6" class devices se upar.
 * Electron multi-tab alag process (`electron/main.js`) — ye hook sirf web/Capacitor layout toggles ke liye.
 */
export function isCapacitorTabletSizedViewport(): boolean {
  if (typeof window === "undefined") return false;
  if (!isCapacitorNativeApp()) return false;
  const sw = window.screen?.width ?? 0;
  const sh = window.screen?.height ?? 0;
  const dpr = window.devicePixelRatio || 1;
  const minCssPx = Math.min(sw, sh) / dpr;
  return minCssPx >= 560;
}
