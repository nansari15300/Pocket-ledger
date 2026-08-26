import { STAFF_ENTITY_LABEL } from "@/lib/staffEntityDisplayName";
export const WEBSITE_VIDEO_PLATFORMS = ["youtube", "facebook", "tiktok"] as const;
export type WebsiteVideoPlatform = (typeof WEBSITE_VIDEO_PLATFORMS)[number];

export const WEBSITE_VIDEO_LABELS = [
  "howto",
  "tutorial",
  "learning",
  "event",
  "update",
] as const;
export type WebsiteVideoLabel = (typeof WEBSITE_VIDEO_LABELS)[number];

export const WEBSITE_VIDEO_LABEL_COPY: Record<WebsiteVideoLabel, string> = {
  howto: "How to use",
  tutorial: "Tutorial",
  learning: "Learning",
  event: "Event",
  update: "Update",
};

export const WEBSITE_VIDEO_CATEGORIES = [
  "getting-started",
  "dashboard",
  "party",
  "bank-cash",
  "staff",
  "tax",
  "incomes",
  "items",
  "reports",
  "gallery",
  "gate",
  "production",
  "sale-note",
  "purchase-note",
  "quotations",
  "messages",
  "drive-sync",
  "billing",
  "distributor-signup",
  "backup",
  "import-export",
  "recycle-bin",
  "settings",
] as const;
export type WebsiteVideoCategory = (typeof WEBSITE_VIDEO_CATEGORIES)[number];

/** Getting started + same labels as app `AppSidebar` menus. */
export const WEBSITE_VIDEO_CATEGORY_COPY: Record<WebsiteVideoCategory, string> = {
  "getting-started": "Getting started",
  dashboard: "Dashboard",
  party: "Parties",
  "bank-cash": "Bank/Cash",
  staff: STAFF_ENTITY_LABEL,
  tax: "Tax",
  incomes: "Income & Expense",
  items: "Items & Service",
  reports: "Reports",
  gallery: "Gallery",
  gate: "Gate",
  production: "Production",
  "sale-note": "Sale Note",
  "purchase-note": "Purchase Note",
  quotations: "Quotations",
  messages: "Messages",
  "drive-sync": "Google Drive sync",
  billing: "Billing & Plans",
  "distributor-signup": "Be a Distributor",
  backup: "Backup & Restore",
  "import-export": "Import/Export",
  "recycle-bin": "Recycle Bin",
  settings: "Settings",
};

/** Older marketing-only keys (except Getting started, which stays). */
const LEGACY_VIDEO_CATEGORY_MAP: Record<string, WebsiteVideoCategory> = {
  "sales-purchase": "sale-note",
  "accounts-reports": "reports",
  "settings-sync": "settings",
  "updates-events": "getting-started",
};

export type WebsiteVideo = {
  id: string;
  title: string;
  url: string;
  platform: WebsiteVideoPlatform;
  label: WebsiteVideoLabel;
  category: WebsiteVideoCategory;
  published: boolean;
  sort: number;
};

export const WEBSITE_VIDEOS_DOC = "app_settings/website_videos";

export function detectWebsiteVideoPlatform(url: string): WebsiteVideoPlatform | null {
  const raw = String(url || "").trim().toLowerCase();
  if (!raw) return null;
  if (raw.includes("youtu.be") || raw.includes("youtube.com") || raw.includes("youtube-nocookie.com")) {
    return "youtube";
  }
  if (raw.includes("facebook.com") || raw.includes("fb.watch") || raw.includes("fb.com")) {
    return "facebook";
  }
  if (raw.includes("tiktok.com")) return "tiktok";
  return null;
}

export function youtubeVideoId(url: string): string | null {
  const raw = String(url || "").trim();
  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{6,})/,
    /youtu\.be\/([a-zA-Z0-9_-]{6,})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{6,})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{6,})/,
  ];
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

export function tiktokVideoId(url: string): string | null {
  const match = String(url || "").trim().match(/tiktok\.com\/@[^/]+\/video\/(\d+)/i);
  return match?.[1] || null;
}

export function websiteVideoEmbedSrc(video: Pick<WebsiteVideo, "url" | "platform">): string | null {
  if (video.platform === "youtube") {
    const id = youtubeVideoId(video.url);
    return id ? `https://www.youtube.com/embed/${id}?autoplay=1&rel=0` : null;
  }
  if (video.platform === "facebook") {
    const href = encodeURIComponent(video.url);
    return `https://www.facebook.com/plugins/video.php?href=${href}&show_text=false&autoplay=true`;
  }
  if (video.platform === "tiktok") {
    const id = tiktokVideoId(video.url);
    return id ? `https://www.tiktok.com/player/v1/${id}?autoplay=1` : null;
  }
  return null;
}

export function websiteVideoThumb(video: Pick<WebsiteVideo, "url" | "platform">): string | null {
  if (video.platform !== "youtube") return null;
  const id = youtubeVideoId(video.url);
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null;
}

function asLabel(raw: unknown): WebsiteVideoLabel {
  const value = String(raw || "").trim().toLowerCase();
  return (WEBSITE_VIDEO_LABELS as readonly string[]).includes(value)
    ? (value as WebsiteVideoLabel)
    : "howto";
}

function asCategory(raw: unknown): WebsiteVideoCategory {
  const value = String(raw || "").trim().toLowerCase();
  if ((WEBSITE_VIDEO_CATEGORIES as readonly string[]).includes(value)) {
    return value as WebsiteVideoCategory;
  }
  if (LEGACY_VIDEO_CATEGORY_MAP[value]) return LEGACY_VIDEO_CATEGORY_MAP[value];
  return "getting-started";
}

export function sanitizeWebsiteVideos(raw: unknown): WebsiteVideo[] {
  const source =
    raw && typeof raw === "object" && Array.isArray((raw as { videos?: unknown }).videos)
      ? (raw as { videos: unknown[] }).videos
      : Array.isArray(raw)
        ? raw
        : [];
  const out: WebsiteVideo[] = [];
  source.forEach((row, index) => {
    if (!row || typeof row !== "object") return;
    const item = row as Record<string, unknown>;
    const url = String(item.url || "").trim();
    const platform = detectWebsiteVideoPlatform(url);
    if (!url || !platform) return;
    const title = String(item.title || "").trim() || "Pocket Ledger video";
    const id = String(item.id || "").trim() || `video-${index + 1}`;
    out.push({
      id,
      title: title.slice(0, 120),
      url,
      platform,
      label: asLabel(item.label),
      category: asCategory(item.category),
      published: item.published !== false,
      sort: Number.isFinite(Number(item.sort)) ? Number(item.sort) : index,
    });
  });
  return out.sort((a, b) => a.sort - b.sort || a.title.localeCompare(b.title));
}

export function publishedWebsiteVideos(raw: unknown): WebsiteVideo[] {
  return sanitizeWebsiteVideos(raw).filter((video) => video.published);
}

/**
 * Website video folder chips follow Admin → Add/Remove Features.
 * `getting-started` is always visible (marketing-only, not an app sidebar feature).
 * Missing feature key = enabled (same as app sidebar).
 */
export function visibleWebsiteVideoCategories(
  featureConfig: Record<string, boolean> | null | undefined
): WebsiteVideoCategory[] {
  return WEBSITE_VIDEO_CATEGORIES.filter((id) => {
    if (id === "getting-started") return true;
    if (!featureConfig) return true;
    return featureConfig[id] !== false;
  });
}
