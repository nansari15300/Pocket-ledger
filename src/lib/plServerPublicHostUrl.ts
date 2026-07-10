/** Build listing URL for public hostname/IP — avoids `:3001:3001` when user typed host:port. */
export function buildPublicServerListingUrl(publicHostRaw: string, port: number): string | null {
  const ph = String(publicHostRaw || "").trim();
  if (!ph || !Number.isFinite(port) || port <= 0) return null;
  try {
    let href = ph;
    if (!/^https?:\/\//i.test(href)) href = `http://${href}`;
    const u = new URL(href);
    const hostname = u.hostname;
    if (!hostname) return null;
    const portPart = u.port || String(port);
    return `http://${hostname}:${portPart}/`;
  } catch {
    const bare = ph
      .replace(/^https?:\/\//i, "")
      .replace(/\/+$/, "")
      .split("/")[0]
      ?.trim();
    if (!bare) return null;
    if (/^[\d.a-f:[\]-]+:\d+$/i.test(bare) || /^[^:/]+:\d+$/.test(bare)) {
      return `http://${bare}/`;
    }
    return `http://${bare}:${port}/`;
  }
}

/** Normalize server listing URL; returns null if invalid (e.g. double port). */
export function normalizePlServerListingUrl(raw: string): string | null {
  const s = String(raw || "").trim();
  if (!s) return null;
  try {
    let href = s;
    if (!/^https?:\/\//i.test(href)) href = `http://${href}`;
    const u = new URL(href);
    const hostname = u.hostname;
    if (!hostname) return null;
    const portPart = u.port || (u.protocol === "https:" ? "443" : "80");
    const path = u.pathname.replace(/\/+$/, "");
    if (path && path !== "/") return null;
    return `http://${hostname}:${portPart}/`;
  } catch {
    return null;
  }
}

export function dedupePlServerListingUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of urls) {
    const norm = normalizePlServerListingUrl(raw);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    out.push(norm);
  }
  return out;
}

/** Invite / alert URLs — saari entries ko active sharing port par rewrite karo. */
export function rewritePlServerListingUrlsPort(urls: string[], port: number): string[] {
  const p = Number(port);
  if (!Number.isFinite(p) || p <= 0) return dedupePlServerListingUrls(urls);
  const out: string[] = [];
  for (const raw of urls) {
    const norm = normalizePlServerListingUrl(raw);
    if (!norm) continue;
    try {
      const u = new URL(norm);
      out.push(`http://${u.hostname}:${p}/`);
    } catch {
      out.push(norm);
    }
  }
  return dedupePlServerListingUrls(out);
}

/** Merge status URLs + ensure public host entry is valid. */
export function buildPlServerInviteUrlList(input: {
  urls?: string[];
  publicHost?: string;
  port?: number;
}): string[] {
  const port = Number(input.port) || 0;
  const merged = [...(input.urls || [])];
  if (input.publicHost?.trim() && port > 0) {
    const pub = buildPublicServerListingUrl(input.publicHost, port);
    if (pub) merged.push(pub);
  }
  const deduped = dedupePlServerListingUrls(merged);
  if (port > 0) return rewritePlServerListingUrlsPort(deduped, port);
  return deduped;
}

/** Saved invite URL picks — empty config means all available addresses. */
export function effectiveSelectedInviteUrls(
  allUrls: string[],
  savedSelection: string[] | undefined | null
): string[] {
  const all = dedupePlServerListingUrls(allUrls);
  const saved = dedupePlServerListingUrls(savedSelection || []);
  if (saved.length === 0) return all;
  const matched = all.filter((u) => {
    const n = normalizePlServerListingUrl(u);
    return n && saved.includes(n);
  });
  if (matched.length === 0 && all.length > 0) return all;
  return matched;
}

export function applySelectedInviteUrls(
  allUrls: string[],
  savedSelection: string[] | undefined | null
): string[] {
  return effectiveSelectedInviteUrls(allUrls, savedSelection);
}

export function isPlServerInviteUrlSelected(
  url: string,
  allUrls: string[],
  savedSelection: string[] | undefined | null
): boolean {
  const norm = normalizePlServerListingUrl(url);
  if (!norm) return false;
  return effectiveSelectedInviteUrls(allUrls, savedSelection).some(
    (u) => normalizePlServerListingUrl(u) === norm
  );
}

export function normalizePublicHostField(raw: string, port: number): string {
  const ph = String(raw || "").trim();
  if (!ph) return "";
  const listing = buildPublicServerListingUrl(ph, port);
  if (!listing) return ph;
  try {
    const u = new URL(listing);
    return u.hostname || ph;
  } catch {
    return ph;
  }
}
