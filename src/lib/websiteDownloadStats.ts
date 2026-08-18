export const DOWNLOAD_PLATFORMS = ["windows", "android", "play"] as const;
export type WebsiteDownloadPlatform = (typeof DOWNLOAD_PLATFORMS)[number];

export type WebsiteDownloadEvent = {
  id: string;
  platform: WebsiteDownloadPlatform;
  country: string;
  countryName?: string;
  version?: string;
  fileName?: string;
  source?: string;
  createdAtMs: number;
};

export type WebsiteDownloadStats = {
  total: number;
  byPlatform: Record<WebsiteDownloadPlatform, number>;
  byCountry: Record<string, number>;
  updatedAtMs: number;
};

export const DOWNLOAD_STATS_DOC = "app_settings/download_stats";
export const DOWNLOAD_EVENTS_COLLECTION = "download_events";

export function isWebsiteDownloadPlatform(raw: unknown): raw is WebsiteDownloadPlatform {
  return (DOWNLOAD_PLATFORMS as readonly string[]).includes(String(raw || "").trim());
}

export function normalizeCountryCode(raw: unknown): string {
  const code = String(raw || "").trim().toUpperCase();
  if (!code || code === "XX" || code === "T1") return "ZZ";
  if (/^[A-Z]{2}$/.test(code)) return code;
  return "ZZ";
}

export function emptyDownloadStats(now = Date.now()): WebsiteDownloadStats {
  return {
    total: 0,
    byPlatform: { windows: 0, android: 0, play: 0 },
    byCountry: {},
    updatedAtMs: now,
  };
}

export function mergeDownloadStatsDoc(raw: unknown): WebsiteDownloadStats {
  const base = emptyDownloadStats();
  if (!raw || typeof raw !== "object") return base;
  const row = raw as Record<string, unknown>;
  const byPlatformRaw =
    row.byPlatform && typeof row.byPlatform === "object"
      ? (row.byPlatform as Record<string, unknown>)
      : {};
  const byCountryRaw =
    row.byCountry && typeof row.byCountry === "object"
      ? (row.byCountry as Record<string, unknown>)
      : {};
  const byCountry: Record<string, number> = {};
  Object.entries(byCountryRaw).forEach(([code, value]) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return;
    byCountry[normalizeCountryCode(code)] = Math.floor(n);
  });
  return {
    total: Math.max(0, Math.floor(Number(row.total) || 0)),
    byPlatform: {
      windows: Math.max(0, Math.floor(Number(byPlatformRaw.windows) || 0)),
      android: Math.max(0, Math.floor(Number(byPlatformRaw.android) || 0)),
      play: Math.max(0, Math.floor(Number(byPlatformRaw.play) || 0)),
    },
    byCountry,
    updatedAtMs: Number(row.updatedAtMs) || Date.now(),
  };
}

/** Best-effort ISO country from common edge/proxy headers. */
export function countryFromRequestHeaders(headers: Headers): string {
  return normalizeCountryCode(
    headers.get("cf-ipcountry") ||
      headers.get("x-vercel-ip-country") ||
      headers.get("x-country-code") ||
      headers.get("cloudfront-viewer-country")
  );
}
