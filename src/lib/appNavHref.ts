/**
 * Static export (Capacitor APK) ma `next.config` ma `trailingSlash: true` hunchha.
 * Link href `/settings` rakhyo bhane kai host/WebView ma full reload / 404 → index fallback hunchha,
 * ra `useCompany` ko timer le companyId sync huna aginai `/company` thichidinchha.
 * `NEXT_PUBLIC_STATIC_BUILD` build-static.js le set garchha — dev ma unset, href jhai rahanchha.
 */
export function appNavHref(path: string): string {
  if (process.env.NEXT_PUBLIC_STATIC_BUILD !== "1") return path;
  if (!path || path === "/") return "/";
  // Static build: preserve query/hash while applying trailing slash only to pathname.
  const hashIndex = path.indexOf("#");
  const hashPart = hashIndex >= 0 ? path.slice(hashIndex) : "";
  const withoutHash = hashIndex >= 0 ? path.slice(0, hashIndex) : path;
  const queryIndex = withoutHash.indexOf("?");
  const queryPart = queryIndex >= 0 ? withoutHash.slice(queryIndex) : "";
  const pathname = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;
  const normalizedPath = pathname.endsWith("/") ? pathname : `${pathname}/`;
  return `${normalizedPath}${queryPart}${hashPart}`;
}

/** Settings tab deep link — static/APK par trailing slash (`/settings/?view=…`) zaroori. */
export function settingsViewHref(viewId: string): string {
  return appNavHref(`/settings?view=${encodeURIComponent(viewId)}`);
}
