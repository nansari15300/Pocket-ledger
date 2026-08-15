/**
 * Hosted/gateway web app may run under `basePath` `/app`.
 * EXE/APK static builds stay at `/` (no WEB_APP_BASE_PATH).
 */
export function webAppBasePath(): string {
  const fromEnv =
    typeof process !== "undefined"
      ? String(process.env.NEXT_PUBLIC_WEB_APP_BASE_PATH || "").trim()
      : "";
  if (fromEnv === "/app") return "/app";
  if (typeof window !== "undefined") {
    const p = window.location.pathname || "";
    if (p === "/app" || p.startsWith("/app/")) return "/app";
  }
  return "";
}

/** Root-relative public file → correct URL under optional `/app` basePath. */
export function publicAssetUrl(assetPath: string): string {
  const clean = String(assetPath || "").startsWith("/")
    ? String(assetPath)
    : `/${String(assetPath || "")}`;
  return `${webAppBasePath()}${clean}`;
}

/**
 * `window.history.replaceState` / `pushState` do NOT apply Next `basePath`.
 * Passing `/party?...` drops `/app` from the address bar — hard refresh then hits the
 * marketing gateway 404. Use this for any history API URL that is app-relative.
 * Do NOT use for `router.push` / `router.replace` (Next already prefixes basePath).
 */
export function browserHistoryHref(pathWithOptionalQueryAndHash: string): string {
  const raw = String(pathWithOptionalQueryAndHash || "");
  if (!raw) return raw;
  const base = webAppBasePath();
  if (!base) return raw;

  if (/^https?:\/\//i.test(raw)) {
    try {
      const u = new URL(raw);
      u.pathname = ensureWebAppBasePathOnPathname(u.pathname, base);
      return `${u.pathname}${u.search}${u.hash}`;
    } catch {
      return raw;
    }
  }

  const hashIndex = raw.indexOf("#");
  const hashPart = hashIndex >= 0 ? raw.slice(hashIndex) : "";
  const withoutHash = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw;
  const queryIndex = withoutHash.indexOf("?");
  const queryPart = queryIndex >= 0 ? withoutHash.slice(queryIndex) : "";
  const pathname = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;
  return `${ensureWebAppBasePathOnPathname(pathname, base)}${queryPart}${hashPart}`;
}

function ensureWebAppBasePathOnPathname(pathname: string, base: string): string {
  const p = pathname || "/";
  if (p === base || p.startsWith(`${base}/`)) return p;
  if (!p.startsWith("/")) return `${base}/${p}`;
  return `${base}${p}`;
}
