/**
 * Temporary hang / long-task console probes (tax txn row click, etc.).
 * Filter DevTools console by: pl-hang
 * Disable: window.__PL_HANG_DIAG__ = false
 */

declare global {
  interface Window {
    __PL_HANG_DIAG__?: boolean;
    __plHangLongTaskObs?: PerformanceObserver;
  }
}

export function plHangEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return window.__PL_HANG_DIAG__ !== false;
}

export function plHang(label: string, detail?: Record<string, unknown>): void {
  if (!plHangEnabled()) return;
  const t = typeof performance !== "undefined" ? Math.round(performance.now()) : 0;
  if (detail && Object.keys(detail).length) {
    console.log(`[pl-hang] ${label}`, { t, ...detail });
  } else {
    console.log(`[pl-hang] ${label}`, { t });
  }
}

/** Returns end() that logs elapsed ms. */
export function plHangStart(label: string, detail?: Record<string, unknown>): () => void {
  if (!plHangEnabled()) return () => {};
  const t0 = performance.now();
  plHang(`START ${label}`, detail);
  return () => {
    const ms = Math.round(performance.now() - t0);
    plHang(`END ${label}`, { ms, ...(detail || {}) });
  };
}

/** Install once: logs main-thread blocks after this call (Chrome). */
export function plHangEnsureLongTaskObserver(): void {
  if (!plHangEnabled() || typeof window === "undefined") return;
  if (window.__plHangLongTaskObs) return;
  try {
    if (!("PerformanceObserver" in window)) return;
    // Do NOT use buffered:true — first click dumps boot/HMR longtasks and looks like a hang loop.
    const installedAt = performance.now();
    const obs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.startTime < installedAt - 16) continue;
        const ms = Math.round(entry.duration);
        // Ignore tiny jank; only surface real freezes (click hang / multi-second blocks).
        if (ms < 200) continue;
        console.warn(`[pl-hang] LONGTASK ${ms}ms`, {
          name: entry.name,
          start: Math.round(entry.startTime),
        });
      }
    });
    obs.observe({ type: "longtask", buffered: false } as PerformanceObserverInit);
    window.__plHangLongTaskObs = obs;
    plHang("longtask observer on");
  } catch {
    /* Safari / older browsers */
  }
}
