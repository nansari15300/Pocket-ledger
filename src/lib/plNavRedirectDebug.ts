"use client";

/**
 * APK redirect trace: voucher save → `/company` / `/dashboard` kaun trigger karta hai.
 *
 * Browser DevTools Remote Debug ya `evaluateJavascript` se enable:
 *   sessionStorage.setItem("pl_nav_redirect_debug", "1");
 * **Screen par live log box (ADB ki zaroorat nahi)** — overlay ke liye ye bhi:
 *   sessionStorage.setItem("pl_nav_redirect_overlay", "1");
 *   (persist chahiye to `localStorage.setItem("pl_nav_redirect_overlay", "1")`)
 *
 * QA build: NEXT_PUBLIC_PL_NAV_REDIRECT_DEBUG=1 + NEXT_PUBLIC_PL_NAV_REDIRECT_OVERLAY=1
 *
 * Optional toast (~4s): sessionStorage `pl_nav_redirect_toast`=1
 * Optional blocking alert (critical paths): sessionStorage `pl_nav_redirect_alert`=1
 *
 * adb (optional): adb logcat | findstr PL-NAV
 *
 * Storage: APK WebView same-origin session/local; tab reload ke baad bhi overlay localStorage pe rehta hai.
 */

import { toast as sonnerToast } from "sonner";

/** CustomEvent — on-device overlay ise sunke UI refresh karti hai */
export const PL_NAV_DBG_LOG_EVENT = "pl_nav_dbg_ring";

/** Ring capacity — lambe trace se RAM/UI dono tame */
const RING_MAX_LINES = 96;
const ringLines: string[] = [];

/** Har [PL-NAV] line overlay + adb dono ko mile */
function appendPlNavDbgRing(line: string): void {
  ringLines.push(line);
  if (ringLines.length > RING_MAX_LINES) ringLines.splice(0, ringLines.length - RING_MAX_LINES);
  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(new CustomEvent(PL_NAV_DBG_LOG_EVENT, { detail: line }));
    } catch {
      /* ignore */
    }
  }
}

/** Overlay component ke liye last N trace lines */
export function getPlNavDbgRingLines(): readonly string[] {
  return ringLines;
}

function envOverlayFlag(): boolean {
  try {
    return typeof process !== "undefined" && process.env?.NEXT_PUBLIC_PL_NAV_REDIRECT_OVERLAY === "1";
  } catch {
    return false;
  }
}

/** Overlay session/local ya build env — traces tabhi dikhenge jab debug ON ho */
export function isPlNavDebugOnScreenEnabled(): boolean {
  if (typeof window === "undefined") return envOverlayFlag();
  try {
    if (window.sessionStorage.getItem("pl_nav_redirect_overlay") === "1") return true;
  } catch {
    /* ignore */
  }
  try {
    if (window.localStorage.getItem("pl_nav_redirect_overlay") === "1") return true;
  } catch {
    /* ignore */
  }
  return envOverlayFlag();
}

export function shouldRenderPlNavDebugOverlay(): boolean {
  return isPlNavRedirectDebugEnabled() && isPlNavDebugOnScreenEnabled();
}

function envFlag(): boolean {
  try {
    return typeof process !== "undefined" && process.env?.NEXT_PUBLIC_PL_NAV_REDIRECT_DEBUG === "1";
  } catch {
    return false;
  }
}

export function isPlNavRedirectDebugEnabled(): boolean {
  if (typeof window === "undefined") return envFlag();
  try {
    if (window.sessionStorage.getItem("pl_nav_redirect_debug") === "1") return true;
  } catch {
    /* private mode */
  }
  return envFlag();
}

function toastFlag(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem("pl_nav_redirect_toast") === "1";
  } catch {
    return false;
  }
}

function alertFlag(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem("pl_nav_redirect_alert") === "1";
  } catch {
    return false;
  }
}

function relMs(): string {
  try {
    if (typeof performance !== "undefined" && typeof performance.now === "function") {
      return performance.now().toFixed(0);
    }
  } catch {
    /* ignore */
  }
  return "0";
}

/** Session-only id prefix — full id mat log karo production accidental leak se bachein */
export function plNavDbgIdHint(id: string | null | undefined): string {
  const s = String(id || "").trim();
  if (!s) return "(empty)";
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
}

/** Har redirect candidate / storage change — console.warn APK logcat me dikh sakta hai */
export function plNavDbg(tag: string, payload?: Record<string, unknown>): void {
  if (!isPlNavRedirectDebugEnabled()) return;
  const path = typeof window !== "undefined" ? window.location.pathname : "";
  const search = typeof window !== "undefined" ? window.location.search : "";
  const row = { path, search, ...(payload ?? {}) };
  console.warn(`[PL-NAV] +${relMs()}ms ${tag}`, row);
  try {
    appendPlNavDbgRing(`+${relMs()}ms ${tag} ${JSON.stringify(row)}`);
  } catch {
    /* ignore */
  }

  try {
    if (toastFlag()) {
      sonnerToast.message(`[PL-NAV] ${tag}`, {
        description: JSON.stringify(row).slice(0, 220),
        duration: 4200,
        id: `pl-nav-${tag.replace(/\s+/g, "_")}-${Date.now()}`,
      });
    }
  } catch {
    /* toast UI missing / headless */
  }
}

/** High-signal-only: clearing company ya /company router.push — alert mode me blocking dialog */
export function plNavDbgCritical(tag: string, payload?: Record<string, unknown>): void {
  plNavDbg(tag, payload);
  try {
    if (!isPlNavRedirectDebugEnabled() || !alertFlag()) return;
    window.alert?.(`[PL-NAV CRITICAL]\n${tag}\n${JSON.stringify({ ...payload, path: window.location.pathname }).slice(0, 500)}`);
  } catch {
    /* ignore */
  }
}
