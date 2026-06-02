import { isStaticAppBuild } from "@/lib/isStaticAppBuild";
import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";
import { isDashboardRedirectGuardActive } from "@/lib/protectFromUnwantedDashboardRedirect";

/** Path compare: trailing slash ignore */
function normalizePathSegment(p: string): string {
  return (p.replace(/\/+$/, "") || "/").toLowerCase();
}

const PL_MODAL_PARENT_QUERY_KEY = "pl-modal-parent-query";
/** Modal khulte waqt poori ledger URL — APK save/outbox ke baad hook+window dono `/dashboard` ho jayein tab bhi restore target mile (`armDashboardRedirectGuard` + replace base path). */
const PL_MODAL_PARENT_HREF_KEY = "pl-modal-parent-href";

/**
 * Static APK: voucher save/outbox ke baad Next `usePathname()` kabhi `/dashboard` ya `/` stale aa jata hai jab WebView abhi
 * party/staff/tax ledger URL par hai — ye SQLite vs server mismatch nahi, router hook race hai.
 * `closeModalInUrl` me `router.replace(\`${pathname}?...\`)` is stale pathname se poora screen `/dashboard` pe chala jata tha.
 *
 * Capacitor native (phone + tablet): hook kabhi `/party` vs `/party/x` bhi galat — **hamesha `window.location.pathname`** (PC jaisa stable URL).
 */
/** Guard / modal-close: session me save ki hui ledger URL (bank/staff/tax/voucher) — invalid ya `/dashboard` ho to null. */
export function readPersistedModalParentHref(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const h = sessionStorage.getItem(PL_MODAL_PARENT_HREF_KEY)?.trim();
    if (!h) return null;
    const pathOnly = normalizePathSegment(h.split("?")[0] || "/");
    if (pathOnly === "/dashboard" || pathOnly === "/") return null;
    return h;
  } catch {
    return null;
  }
}

export function pathnameForModalRouterReplace(hookPathname: string): string {
  if (typeof window === "undefined") return hookPathname;

  const persistedLedger = readPersistedModalParentHref();
  const hookSegEarly = normalizePathSegment(hookPathname || "/");
  // Online resume guard: stale Next hook `/dashboard` ho to session ledger path prefer karo (modal close jump band).
  if (
    persistedLedger &&
    isDashboardRedirectGuardActive() &&
    (hookSegEarly === "/dashboard" || hookSegEarly === "/")
  ) {
    return persistedLedger.split("?")[0] || hookPathname;
  }
  if (persistedLedger) {
    const persistedPath = normalizePathSegment(persistedLedger.split("?")[0] || "/");
    const hookSeg = normalizePathSegment(hookPathname || "/");
    const liveSeg = normalizePathSegment(window.location.pathname || "/");
    // SQLite flush ke baad Next + WebView dono `/dashboard` stale — replace ka base galat na ho
    if (
      persistedPath !== "/dashboard" &&
      persistedPath !== "/" &&
      (hookSeg === "/dashboard" || hookSeg === "/" || liveSeg === "/dashboard" || liveSeg === "/")
    ) {
      return persistedLedger.split("?")[0] || hookPathname;
    }
  }

  const liveRaw = window.location.pathname || "/";
  const live = normalizePathSegment(liveRaw);
  const hook = normalizePathSegment(hookPathname || "/");
  if (live === hook) return hookPathname;

  // Reverse race (save / SQLite / outbox): address bar pehle `/dashboard` ho jata hai jab Next hook abhi
  // `/party`/`/staff`/… ledger batata hai — agar yahan `liveRaw` prefer kiye to modal-close `router.replace`
  // poori screen dashboard pe kheench leta tha (party/bank/voucher save ke baad "home jump").
  if (
    (live === "/dashboard" || live === "/") &&
    hook !== "/dashboard" &&
    hook !== "/"
  ) {
    return hookPathname;
  }

  if (isStaticAppBuild() && isCapacitorNativeApp()) return liveRaw;

  if (!isStaticAppBuild()) return hookPathname;
  if (hook === "/dashboard" || hook === "/") return liveRaw;
  return hookPathname;
}

/**
 * Mobile APK / WebView: voucher approve ya save ke turant baad Next.js `useSearchParams()`
 * kabhi ek frame purana reh jata hai. `closeModalInUrl` me seedha wahi use karoge to
 * `?selected=` / `view=` drop ho kar master-detail “home pe jump” jaisa lagta hai.
 * Browser address bar (`window.location.search`) ko prefer karo jab non-empty ho.
 *
 * Extra: `persistPlModalParentQuery` + backup — window **aur** hook dono empty/stale hon
 * to bhi open-modal waqt save ki hui query se `selected` / `view` restore.
 */

/** Next hook string normalize — leading `?` hatao */
function normalizeQs(q: string): string {
  return q.replace(/^\?/, "").trim();
}

/** Pehle Next (`fallback`), phir `window` se keys overlay — live URL ko priority */
export function mergeLiveAndNextSearchParams(windowSearchNoQ: string, fallbackFromNextHook: string): string {
  const out = new URLSearchParams(normalizeQs(fallbackFromNextHook));
  const win = new URLSearchParams(normalizeQs(windowSearchNoQ));
  win.forEach((v, k) => out.set(k, v));
  return out.toString();
}

export function searchParamsStringForModalClose(fallbackFromNextHook: string): string {
  if (typeof window !== "undefined" && window.location.search) {
    const win = window.location.search.replace(/^\?/, "");
    return mergeLiveAndNextSearchParams(win, fallbackFromNextHook);
  }
  return normalizeQs(fallbackFromNextHook);
}

/** Mobile voucher/modal khulte waqt: merged query (bina `modal` / `modalts`) session me — close par missing keys yahi se bharo */
export function persistPlModalParentQuery(fallbackFromNextHook: string): void {
  try {
    const merged = searchParamsStringForModalClose(fallbackFromNextHook);
    const p = new URLSearchParams(merged);
    p.delete("modal");
    p.delete("modalts");
    sessionStorage.setItem(PL_MODAL_PARENT_QUERY_KEY, p.toString());
    // Poori path+query: save ke race me sirf query backup se pathname recover na ho paye — `/bank-cash` vs `/party` bhi lock
    if (typeof window !== "undefined") {
      const path = window.location.pathname || "/";
      const qs = p.toString();
      sessionStorage.setItem(PL_MODAL_PARENT_HREF_KEY, `${path}${qs ? `?${qs}` : ""}`);
    }
  } catch {
    /* private mode / WebView */
  }
}

/**
 * Party/Bank/detail ledger (desktop bhi): voucher/master dialog se *pehle* call karo.
 * Pehle sirf mobile `openModalInUrl` persist karta tha — wide desktop par save/approve ke baad guard ko target URL nahi milta `/dashboard` jump.
 */
export function persistLedgerModalParentFromBrowser(): void {
  if (typeof window === "undefined") return;
  persistPlModalParentQuery(window.location.search.replace(/^\?/, ""));
}

/** `raw` me jo keys missing hain, backup se add — APK par approve ke baad `selected=` bachane ke liye */
export function applyPlModalParentQueryBackup(rawMergedNoLeadingQuestion: string): string {
  try {
    const backup = sessionStorage.getItem(PL_MODAL_PARENT_QUERY_KEY);
    if (!backup) return rawMergedNoLeadingQuestion;
    const out = new URLSearchParams(normalizeQs(rawMergedNoLeadingQuestion));
    const b = new URLSearchParams(backup);
    b.forEach((v, k) => {
      if (!out.has(k)) out.set(k, v);
    });
    return out.toString();
  } catch {
    return rawMergedNoLeadingQuestion;
  }
}

export function clearPlModalParentQueryBackup(): void {
  try {
    sessionStorage.removeItem(PL_MODAL_PARENT_QUERY_KEY);
    sessionStorage.removeItem(PL_MODAL_PARENT_HREF_KEY);
  } catch {
    /* ignore */
  }
}

/** Mobile: popup open hai lekin URL se `modal` hat gaya — replace se wapas lagao (dialog band mat karo). */
export function buildModalRepairHref(pathname: string, fallbackSearchFromNextHook: string): string {
  persistPlModalParentQuery(fallbackSearchFromNextHook);
  const params = new URLSearchParams(searchParamsStringForModalClose(fallbackSearchFromNextHook));
  params.set("modal", "1");
  if (!params.has("modalts")) params.set("modalts", String(Date.now()));
  const basePath = pathnameForModalRouterReplace(pathname);
  const q = params.toString();
  return q ? `${basePath}?${q}` : basePath;
}

/** Master-detail `router.replace(canonical)` se pehle/baad: open modal query preserve karo. */
export function appendPreservedModalQueryToHref(href: string): string {
  if (typeof window === "undefined") return href;
  const cur = new URLSearchParams(window.location.search.replace(/^\?/, ""));
  if (cur.get("modal") !== "1") return href;
  try {
    const u = new URL(href, window.location.origin);
    u.searchParams.set("modal", "1");
    const ts = cur.get("modalts");
    if (ts) u.searchParams.set("modalts", ts);
    return `${u.pathname}${u.search ? u.search : ""}`;
  } catch {
    return href;
  }
}

/** Close handler: merge window+Next, phir backup se gaps bharo */
export function searchParamsStringAfterClosingModal(fallbackFromNextHook: string): string {
  const base = searchParamsStringForModalClose(fallbackFromNextHook);
  return applyPlModalParentQueryBackup(base);
}

/**
 * Approve/save ke baad modal close: merge kabhi `?selected=` / `view=groups` hata deta (APK stale hook).
 * Master screen apni row id yahan set kare to list/detail URL stable rehta hai — "dashboard / home jump" kam.
 */
export function patchMasterDetailUrlAfterModalClose(
  params: URLSearchParams,
  spec: { entityId: string; groupsTab?: boolean }
): void {
  const id = String(spec.entityId || "").trim();
  if (!id) return;
  if (!params.has("selected")) params.set("selected", id);
  // Group ledger tabs: bina `view=groups` ke restore effect galat tab khol sakta hai
  if (spec.groupsTab && params.get("view") !== "groups") params.set("view", "groups");
}
