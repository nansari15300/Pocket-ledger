"use client";

/**
 * Cheap, rate-limited console.debug for company-registry pull / reload triggers.
 * Max one line per key per 2 s; suppressed calls are counted and reported in the next line.
 */
const WINDOW_MS = 2000;
const state = new Map<string, { lastAt: number; suppressed: number }>();

export function plRegistryPullDebug(
  key: string,
  message: string,
  data?: Record<string, unknown> | (() => Record<string, unknown>)
): void {
  if (typeof console === "undefined") return;
  const now = Date.now();
  const s = state.get(key) ?? { lastAt: 0, suppressed: 0 };
  if (now - s.lastAt < WINDOW_MS) {
    s.suppressed += 1;
    state.set(key, s);
    return;
  }
  const suppressed = s.suppressed;
  state.set(key, { lastAt: now, suppressed: 0 });
  try {
    const payload = typeof data === "function" ? data() : data;
    console.debug(`[pl-registry-pull] ${key}: ${message}`, { ...(payload ?? {}), suppressedSinceLast: suppressed });
  } catch {
    /* ignore */
  }
}

/** Caller frame (file:line) - only computed when a line will actually be logged by the caller. */
export function plCallerFrame(depth = 3): string {
  try {
    const lines = String(new Error().stack || "").split("\n");
    return (lines[depth] || "").trim().slice(0, 200);
  } catch {
    return "";
  }
}

/** Several caller frames (for synchronous event listeners this includes the dispatcher). */
export function plCallerStack(from = 3, to = 12): string[] {
  try {
    return String(new Error().stack || "")
      .split("\n")
      .slice(from, to)
      .map((l) => l.trim().slice(0, 200));
  } catch {
    return [];
  }
}
