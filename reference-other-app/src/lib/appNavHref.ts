/**
 * Static export (Capacitor APK) ma `next.config` ma `trailingSlash: true` hunchha.
 * Link href `/settings` rakhyo bhane kai host/WebView ma full reload / 404 → index fallback hunchha,
 * ra `useCompany` ko timer le companyId sync huna aginai `/company` thichidinchha.
 * `NEXT_PUBLIC_STATIC_BUILD` build-static.js le set garchha — dev ma unset, href jhai rahanchha.
 */
export function appNavHref(path: string): string {
  if (process.env.NEXT_PUBLIC_STATIC_BUILD !== "1") return path;
  if (!path || path === "/") return "/";
  return path.endsWith("/") ? path : `${path}/`;
}
