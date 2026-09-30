/**
 * Master-detail pages: `processedParties` / `processedStaff` har snapshot par naya array reference
 * dete hain — isi liye URL-sync `useEffect` baar-baar `router.replace(sahi_url)` chal sakta hai.
 * Browser me URL pehle se wahi ho to replace mat karo — warna refresh ke baad 2× fast "reload" jaisa lagta hai.
 *
 * Hosted `/app` basePath: `window.location` = `/app/party`, Next `router.replace("/party")` want = `/party`.
 * Path compare bina basePath strip ke hamesha different → infinite soft-nav (GET /party spam).
 */
import { withoutWebAppBasePath } from "@/lib/webAppBasePath";

export function shouldReplaceWithMasterDetailCanonical(canonicalHref: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    const cur = new URL(window.location.href);
    const want = new URL(canonicalHref, window.location.origin);
    const normPath = (p: string) =>
      (withoutWebAppBasePath(p.replace(/\/+$/, "") || "/") || "/").toLowerCase();
    const samePath = normPath(cur.pathname) === normPath(want.pathname);
    const sameSearch = (cur.search || "") === (want.search || "");
    return !(samePath && sameSearch);
  } catch {
    return true;
  }
}
