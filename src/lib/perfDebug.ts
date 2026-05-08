"use client";

const PERF_DEBUG_KEY = "pl_perf_debug";

export function isPerfDebugEnabled(): boolean {
  try {
    if (typeof window === "undefined") return false;
    const raw = String(window.localStorage.getItem(PERF_DEBUG_KEY) || "").trim().toLowerCase();
    return raw === "1" || raw === "true" || raw === "on";
  } catch {
    return false;
  }
}

export function perfNow(): number {
  try {
    if (typeof performance !== "undefined" && typeof performance.now === "function") {
      return performance.now();
    }
  } catch {
    /* ignore */
  }
  return Date.now();
}

export function perfDebugLog(
  label: string,
  startMs: number,
  meta?: Record<string, unknown>,
  thresholdMs = 24
): void {
  if (!isPerfDebugEnabled()) return;
  const durationMs = perfNow() - startMs;
  // Keep logs focused: only print expensive blocks that can impact click/hover responsiveness.
  if (durationMs < thresholdMs) return;
  try {
    console.warn("[PL-PERF]", label, {
      durationMs: Math.round(durationMs * 10) / 10,
      ...(meta || {}),
    });
  } catch {
    /* ignore */
  }
}

