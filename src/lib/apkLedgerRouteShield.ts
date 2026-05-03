"use client";

/**
 * Capacitor APK (aur chhuti static-mobile browser): async Firestore/SQLite ke daur `usePathname()` stale `/dashboard` ho jata hai;
 * modal close par `router.replace(stale pathname)` poori screen udha deta hai (`modalUrlSync.ts` comments).
 * Ye module write se *turant pehle* live `window.location` session me lock karti hai + layout par guard extend trigger.
 * `pl_apk_ledger_shield_until_ms`: save ke baad chhoti khidki — `clearCompanyId`/`/company` race rokhti hai (`useCompany`/listener delay se zyada).
 */

import { isStaticAppBuild } from "@/lib/isStaticAppBuild";
import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";
import { persistPlModalParentQuery } from "@/lib/modalUrlSync";
import { readSelectedCompanyId, writeSelectedCompanyId } from "@/lib/selectedCompanyStorage";
import { isDashboardRedirectGuardActive } from "@/lib/protectFromUnwantedDashboardRedirect";
import { plDbgCompanyRecovery } from "@/lib/plDebugCompanyRecovery";
import { plNavDbg, plNavDbgIdHint } from "@/lib/plNavRedirectDebug";

/** Save/approve outbox-window: SQLite list recovery `clearCompanyId` se lambi — milliseconds from `Date.now()` */
const PL_LEDGER_SHIELD_UNTIL_KEY = "pl_apk_ledger_shield_until_ms";
const LEDGER_SHIELD_HOLD_MS = 26_000;

/** `document.addEventListener` ke liye — layout isi se guard arm karta hai (`capture: true`). */
export const PL_APK_LEDGER_WRITE_ARM_EVENT = "pl_apk_ledger_write_arm";

export function apkLedgerRouteShieldEligible(): boolean {
  if (typeof window === "undefined") return false;
  /**
   * Pehle: sirf static (`build:static`) + native — remote WebView (`cap:sync:remote`, live site bundle) par
   * `NEXT_PUBLIC_STATIC_BUILD` kabhi `"1"` nahin ho → Shield **kabhi activate hi nahin**, voucher save ke baad
   * `clearCompanyId`/`/company` race kholta tha.
   */
  if (isCapacitorNativeApp()) return true;
  return false;
}

/**
 * Narrow mobile browser (Capacitor nahi): static PWA race kabhi‑kabhi waheen — snapshot cheap hai.
 */
function staticMobileNarrowBrowser(): boolean {
  if (typeof window === "undefined" || !isStaticAppBuild() || isCapacitorNativeApp()) {
    return false;
  }
  return typeof window.matchMedia === "function" && window.matchMedia("(max-width: 767px)").matches;
}

export function shouldSnapshotLedgerUrlBeforeWrite(): boolean {
  return apkLedgerRouteShieldEligible() || staticMobileNarrowBrowser();
}

/** APK/static narrow: voucher save/recover race me `companyId` read null hota hai — `clearCompanyId`/`/company` mat chalao */
export function isApkLedgerWriteShieldActive(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const until = Number(sessionStorage.getItem(PL_LEDGER_SHIELD_UNTIL_KEY) || 0);
    return Number.isFinite(until) && until > Date.now();
  } catch {
    return false;
  }
}

/** `clearCompanyId` aur `/company` push se pehle check — dashboard guard + ledger shield dono */
export function shouldSuppressTransientCompanyClear(): boolean {
  return isDashboardRedirectGuardActive() || isApkLedgerWriteShieldActive();
}

/**
 * APK: SQLite/file save turant hai → kabhi ek frame tak React `companyId` null rehe jata hai magar tab/session/localStorage par company already pinned.
 * Transient stale (`!reactId` + persisted) par `/company` timer mat uthao — persisted hi source ho sakta hai.
 */
export function shouldDeferMissingCompanyRedirectNative(reactCompanyId: string | null | undefined): boolean {
  if (typeof window === "undefined" || !isCapacitorNativeApp()) return false;
  try {
    const persisted = String(readSelectedCompanyId() || "").trim();
    const reactId = String(reactCompanyId ?? "").trim();
    if (!persisted) return false;
    return reactId === "";
  } catch {
    return false;
  }
}

function bumpLedgerWriteShieldDeadline(): void {
  if (!shouldSnapshotLedgerUrlBeforeWrite() || typeof window === "undefined") return;
  try {
    sessionStorage.setItem(PL_LEDGER_SHIELD_UNTIL_KEY, String(Date.now() + LEDGER_SHIELD_HOLD_MS));
  } catch {
    /* private mode */
  }
}

/** Session me ledger URL backup — pathnameForModalRouterReplace fallback. */
export function snapshotApkLedgerUrlBeforeAsyncWrite(): void {
  if (!shouldSnapshotLedgerUrlBeforeWrite() || typeof window === "undefined") return;
  const qs = (window.location.search || "").replace(/^\?/, "");
  persistPlModalParentQuery(qs);
}

/** APK par company id glitch → `/company`; save start par dubara pin karo. */
function pinCompanyIdIfAny(id: string | undefined): void {
  const c = String(id || "").trim();
  if (!c) return;
  try {
    writeSelectedCompanyId(c);
  } catch {
    /* ignore */
  }
}

export function notifyApkLedgerAsyncWriteStarted(): void {
  if (!shouldSnapshotLedgerUrlBeforeWrite() || typeof window === "undefined") return;
  try {
    window.dispatchEvent(new Event(PL_APK_LEDGER_WRITE_ARM_EVENT, { bubbles: true, cancelable: false }));
  } catch {
    /* ignore */
  }
}

/** Voucher/master save entry: ek call me snapshot + notify + optional company pin. */
export function beginApkLedgerAsyncWriteShield(opts?: { pinCompanyId?: string | null }): void {
  // Deadline pehle bump: snapshot/event ke fail hone par bhi company-recovery stale read roke
  bumpLedgerWriteShieldDeadline();
  snapshotApkLedgerUrlBeforeAsyncWrite();
  // Arg kabhi glitch empty ho tab bhi persisted id pin karo (local save fast race)
  const pinTarget = String(opts?.pinCompanyId ?? "").trim() || String(readSelectedCompanyId() ?? "").trim();
  pinCompanyIdIfAny(pinTarget || undefined);
  notifyApkLedgerAsyncWriteStarted();
  plNavDbg("apkLedgerShield.begin", {
    pinHint: plNavDbgIdHint(pinTarget || String(opts?.pinCompanyId ?? "")),
    transientSuppress: shouldSuppressTransientCompanyClear(),
  });
  // P3 correlate: voucher save/arm vs `listRecovery:*` timestamps (debug flag off = no-op)
  plDbgCompanyRecovery("ledgerShield:beginApkLedgerAsyncWriteShield", {
    snapshotEligible: shouldSnapshotLedgerUrlBeforeWrite(),
    pinCompanyId: String(pinTarget || String(opts?.pinCompanyId ?? "")).trim().slice(0, 24) || null,
  });
}
