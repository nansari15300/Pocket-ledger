"use client";

/**
 * APK / Capacitor mobile: voucher approve / save+approve ke baad kuch parent / global effect
 * silently `/dashboard` (kabhi `/company`) push kar deta hai (exact source pin point nahi hua — multiple
 * candidate effects). Ye helper deterministic guard hai: poll every 100ms for ~5s and
 * restore agar pathname fallback `/dashboard` ya `/company` ban jaye.
 *
 * Usage: caller ne dialog close ke turant pehle / approve start par invoke karna chahiye.
 * Idempotent: agar pehle se ek armed guard chal raha hai, naye snapshot ke saath duration
 * extend karta hai, double interval nahi banata.
 */

import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { isStaticAppBuild } from "@/lib/isStaticAppBuild";
import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";
import { readPersistedModalParentHref } from "@/lib/modalUrlSync";
import { plNavDbg } from "@/lib/plNavRedirectDebug";

const SESSION_PROTECT_UNTIL_KEY = "pl_voucher_approve_protect_until";
const SESSION_PROTECT_TARGET_KEY = "pl_voucher_approve_protect_target";

type GuardState = {
  intervalId: ReturnType<typeof setInterval> | null;
  endsAt: number;
  targetHref: string;
  popstateListener: ((e: PopStateEvent) => void) | null;
};

const guard: GuardState = {
  intervalId: null,
  endsAt: 0,
  targetHref: "",
  popstateListener: null,
};
/** Spam rokho: fallback par atke hue interval me har 100ms ek hi log na bhar de */
let lastDashboardGuardRestoreLogAt = 0;

/** Static APK race me ye 2 fallback routes par galat jump dikha tha; guard in dono par restore karega. */
function isUnexpectedFallbackRedirectPath(path: string): boolean {
  return path === "/dashboard" || path === "/company";
}

function normalizePath(p: string): string {
  return (p.replace(/\/+$/, "") || "/").toLowerCase();
}

function currentHrefSnapshot(): string {
  if (typeof window === "undefined") return "/";
  const path = window.location.pathname || "/";
  const search = window.location.search || "";
  const hash = window.location.hash || "";
  return `${path}${search}${hash}`;
}

function clearGuardInternal() {
  if (guard.intervalId != null) {
    clearInterval(guard.intervalId);
    guard.intervalId = null;
  }
  if (guard.popstateListener) {
    try {
      window.removeEventListener("popstate", guard.popstateListener, true);
    } catch {
      /* ignore */
    }
    guard.popstateListener = null;
  }
  guard.endsAt = 0;
  guard.targetHref = "";
  try {
    sessionStorage.removeItem(SESSION_PROTECT_UNTIL_KEY);
    sessionStorage.removeItem(SESSION_PROTECT_TARGET_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Active hai? Dashboard page ke `pendingEditVoucher` effect / similar redirects ko bypass karne ke liye.
 */
export function isDashboardRedirectGuardActive(): boolean {
  if (typeof window === "undefined") return false;
  if (guard.endsAt > Date.now()) return true;
  try {
    const until = Number(sessionStorage.getItem(SESSION_PROTECT_UNTIL_KEY) || 0);
    return until > Date.now();
  } catch {
    return false;
  }
}

/**
 * Voucher approve / dialog-close / submit-save ke turant pehle bulaya jata hai.
 * - Static APK + mobile par effective; web/desktop par no-op (pure overhead avoid).
 * - ~5s (web static) / ~8s (native APK, slower flush) tak har 100ms pathname check;
 *   unexpected `/dashboard` ya `/company` jump mile to snapshot restore.
 * - Caller ke pas current router instance ho — `router.replace()` se Next.js routing state bhi sync.
 */
export function armDashboardRedirectGuard(
  router: AppRouterInstance,
  options?: { durationMs?: number; isMobile?: boolean }
): void {
  if (typeof window === "undefined") return;
  if (!isStaticAppBuild()) return;
  const nativeApk = isCapacitorNativeApp();
  const narrowViewport =
    typeof window.matchMedia === "function" && window.matchMedia("(max-width: 767px)").matches;
  const explicit = options?.isMobile;
  // Tablet APK landscape: `useIsMobile` false + width >767 — pehle guard skip ho jata tha; native flag se sab APK par arm.
  if (explicit === false && !nativeApk) {
    plNavDbg("dashboardGuard.armSkipped.viewportRule", { nativeApk, explicitMobile: explicit });
    return;
  }
  if (!nativeApk && !narrowViewport && explicit !== true) {
    plNavDbg("dashboardGuard.armSkipped.notNarrowExplicit", {
      narrowViewport,
      explicitMobile: explicit,
      nativeApk,
    });
    return;
  }

  // APK par SQLite/outbox flush zyada slow ho sakta hai — thoda lamba window taaki late redirect bhi pakde
  const defaultDurationMs = nativeApk ? 8000 : 5000;

  let snapshotHref = currentHrefSnapshot();
  let snapshotPath = normalizePath(snapshotHref.split("?")[0] || "/");
  // Save/async race: window pehle `/dashboard` ho chuka ho jabki modal bank/staff/voucher se khula tha — session backup se target lo (warna guard skip → redirect pakka).
  if (snapshotPath === "/dashboard" || snapshotPath === "/company") {
    const fb = readPersistedModalParentHref();
    if (fb) {
      snapshotHref = fb;
      snapshotPath = normalizePath(fb.split("?")[0] || "/");
    }
  }
  // Ab bhi fallback/home: restore ke liye koi ledger URL nahi — guard skip.
  if (isUnexpectedFallbackRedirectPath(snapshotPath) || snapshotPath === "/") {
    plNavDbg("dashboardGuard.armSkipped.snapshotIsFallbackNoBackup", {
      snapshotPath,
      persistedFallback: snapshotHref.slice(0, 120),
    });
    return;
  }

  const durationMs = Math.max(500, options?.durationMs ?? defaultDurationMs);
  const newEndsAt = Date.now() + durationMs;

  // Pehle se armed: target wahi rakho jo originally tha (purana edit → save & approve dono ek hi flow);
  // sirf endsAt extend karo. Naya target snapshot tab use karo jab guard expired ho chuka.
  if (guard.intervalId != null && guard.endsAt > Date.now()) {
    guard.endsAt = Math.max(guard.endsAt, newEndsAt);
    try {
      sessionStorage.setItem(SESSION_PROTECT_UNTIL_KEY, String(guard.endsAt));
    } catch {
      /* ignore */
    }
    return;
  }

  guard.targetHref = snapshotHref;
  guard.endsAt = newEndsAt;
  plNavDbg("dashboardGuard.armed", {
    targetHref: snapshotHref.slice(0, 160),
    durationMs,
    nativeApk,
  });
  try {
    sessionStorage.setItem(SESSION_PROTECT_UNTIL_KEY, String(guard.endsAt));
    sessionStorage.setItem(SESSION_PROTECT_TARGET_KEY, snapshotHref);
  } catch {
    /* ignore */
  }

  const restoreIfNeeded = () => {
    if (typeof window === "undefined") return;
    const nowPath = normalizePath(window.location.pathname || "/");
    if (!isUnexpectedFallbackRedirectPath(nowPath)) return;
    // Target empty / ya fallback hi ho to skip.
    if (!guard.targetHref) return;
    if (isUnexpectedFallbackRedirectPath(normalizePath(guard.targetHref.split("?")[0] || "/"))) return;
    try {
      const now = Date.now();
      if (now - lastDashboardGuardRestoreLogAt > 2400) {
        lastDashboardGuardRestoreLogAt = now;
        plNavDbg("dashboardGuard.router.replaceExecuting", {
          sawPath: nowPath,
          to: guard.targetHref.slice(0, 160),
        });
      }
      window.history.replaceState(window.history.state ?? null, "", guard.targetHref);
    } catch {
      /* ignore */
    }
    try {
      router.replace(guard.targetHref);
    } catch {
      /* ignore */
    }
  };

  // Pehla check ASAP (next microtask) — short-circuit synchronous redirect.
  Promise.resolve().then(restoreIfNeeded);

  guard.intervalId = setInterval(() => {
    if (Date.now() >= guard.endsAt) {
      clearGuardInternal();
      return;
    }
    restoreIfNeeded();
  }, 100);

  // popstate (back/forward) bhi watch — agar restore karne ke baad user khud back kare to guard band kar do.
  guard.popstateListener = () => {
    // User actively navigating: fallback routes se bahar gaya to guard release.
    const nowPath = normalizePath(window.location.pathname || "/");
    if (!isUnexpectedFallbackRedirectPath(nowPath)) {
      clearGuardInternal();
    }
  };
  try {
    window.addEventListener("popstate", guard.popstateListener, true);
  } catch {
    /* ignore */
  }
}

/** Manually disarm — typically not needed; auto-cleanup expires after duration. */
export function disarmDashboardRedirectGuard(): void {
  clearGuardInternal();
}
