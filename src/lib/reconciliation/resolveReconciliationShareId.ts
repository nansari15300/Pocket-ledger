/** Static export placeholder — build-time segment; asli shareId URL/query se aata hai */
export const RECON_STATIC_PLACEHOLDER_SHARE_ID = "__placeholder__";

/** Path `/reconciliation/{shareId}` — legacy static/APK links */
export function parseReconciliationShareIdFromPathname(pathname: string): string | null {
  const norm = (pathname || "").replace(/\/+$/, "") || "/";
  const m = norm.match(/^\/reconciliation\/([^/]+)$/);
  if (!m) return null;
  const seg = decodeURIComponent(m[1]).trim();
  if (!seg || seg === RECON_STATIC_PLACEHOLDER_SHARE_ID) return null;
  return seg;
}

/**
 * Reconciling page shareId — static/EXE me `useParams` kabhi `__placeholder__` rehta hai;
 * query `?shareId=`, pathname segment, ya `window.location` se resolve karo.
 */
export function resolveReconciliationShareIdFromRoute(opts: {
  paramShareId?: string | string[] | null | undefined;
  searchShareId?: string | null | undefined;
}): string {
  const fromSearch = String(opts.searchShareId ?? "").trim();
  if (fromSearch && fromSearch !== RECON_STATIC_PLACEHOLDER_SHARE_ID) {
    try {
      return decodeURIComponent(fromSearch);
    } catch {
      return fromSearch;
    }
  }

  const raw = Array.isArray(opts.paramShareId) ? opts.paramShareId[0] : opts.paramShareId;
  const fromParam = String(raw ?? "").trim();
  if (fromParam && fromParam !== RECON_STATIC_PLACEHOLDER_SHARE_ID) {
    try {
      return decodeURIComponent(fromParam);
    } catch {
      return fromParam;
    }
  }

  if (typeof window !== "undefined") {
    const fromPath = parseReconciliationShareIdFromPathname(window.location.pathname);
    if (fromPath) return fromPath;
    try {
      const q = new URLSearchParams(window.location.search).get("shareId");
      if (q?.trim() && q !== RECON_STATIC_PLACEHOLDER_SHARE_ID) {
        return decodeURIComponent(q.trim());
      }
    } catch {
      /* ignore */
    }
  }

  return "";
}
