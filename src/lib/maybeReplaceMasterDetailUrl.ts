/**
 * Master-detail pages: `processedParties` / `processedStaff` har snapshot par naya array reference
 * dete hain — isi liye URL-sync `useEffect` baar-baar `router.replace(sahi_url)` chal sakta hai.
 * Browser me URL pehle se wahi ho to replace mat karo — warna refresh ke baad 2× fast "reload" jaisa lagta hai.
 */
export function shouldReplaceWithMasterDetailCanonical(canonicalHref: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    const cur = new URL(window.location.href);
    const want = new URL(canonicalHref, window.location.origin);
    const normPath = (p: string) => (p.replace(/\/+$/, "") || "/").toLowerCase();
    const samePath = normPath(cur.pathname) === normPath(want.pathname);
    const sameSearch = (cur.search || "") === (want.search || "");
    return !(samePath && sameSearch);
  } catch {
    return true;
  }
}
