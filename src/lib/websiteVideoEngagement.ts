export type WebsiteVideoEngagement = {
  views: number;
  likes: number;
  ratingSum: number;
  ratingCount: number;
  /** Average 0–5; 0 when nobody rated. */
  ratingAvg: number;
};

export type WebsiteVideoEngagementAction = "view" | "like" | "unlike" | "rate";

export const WEBSITE_VIDEO_STATS_DOC = "app_settings/website_video_stats";

export function emptyVideoEngagement(): WebsiteVideoEngagement {
  return { views: 0, likes: 0, ratingSum: 0, ratingCount: 0, ratingAvg: 0 };
}

export function normalizeVideoId(raw: unknown): string {
  return String(raw || "")
    .trim()
    .slice(0, 80)
    .replace(/[^\w.-]+/g, "-");
}

export function clampRating(raw: unknown): number | null {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n) || n < 1 || n > 5) return null;
  return n;
}

export function mergeVideoEngagement(raw: unknown): WebsiteVideoEngagement {
  const base = emptyVideoEngagement();
  if (!raw || typeof raw !== "object") return base;
  const row = raw as Record<string, unknown>;
  const ratingSum = Math.max(0, Math.floor(Number(row.ratingSum) || 0));
  const ratingCount = Math.max(0, Math.floor(Number(row.ratingCount) || 0));
  return {
    views: Math.max(0, Math.floor(Number(row.views) || 0)),
    likes: Math.max(0, Math.floor(Number(row.likes) || 0)),
    ratingSum,
    ratingCount,
    ratingAvg: ratingCount > 0 ? Math.round((ratingSum / ratingCount) * 10) / 10 : 0,
  };
}

export function mergeVideoStatsDoc(raw: unknown): Record<string, WebsiteVideoEngagement> {
  const out: Record<string, WebsiteVideoEngagement> = {};
  if (!raw || typeof raw !== "object") return out;
  const byVideo =
    (raw as { byVideo?: unknown }).byVideo && typeof (raw as { byVideo?: unknown }).byVideo === "object"
      ? ((raw as { byVideo: Record<string, unknown> }).byVideo as Record<string, unknown>)
      : (raw as Record<string, unknown>);
  Object.entries(byVideo).forEach(([id, value]) => {
    const key = normalizeVideoId(id);
    if (!key || key === "byVideo" || key === "updatedAtMs") return;
    out[key] = mergeVideoEngagement(value);
  });
  return out;
}

export function publicEngagementPayload(raw: WebsiteVideoEngagement): {
  views: number;
  likes: number;
  ratingAvg: number;
  ratingCount: number;
} {
  return {
    views: raw.views,
    likes: raw.likes,
    ratingAvg: raw.ratingAvg,
    ratingCount: raw.ratingCount,
  };
}
