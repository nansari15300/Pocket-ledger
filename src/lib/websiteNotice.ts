export const WEBSITE_NOTICE_DOC = "app_settings/website_notice";

export type WebsiteNoticeDoc = {
  message?: string;
  enabled?: boolean;
  updatedAt?: string;
};

export function normalizeWebsiteNotice(raw: unknown): { message: string; enabled: boolean } {
  const data = raw && typeof raw === "object" ? (raw as WebsiteNoticeDoc) : {};
  return {
    message: String(data.message || "").trim(),
    enabled: Boolean(data.enabled),
  };
}

export function publicWebsiteNoticePayload(raw: unknown): {
  message: string | null;
  enabled: boolean;
} {
  const notice = normalizeWebsiteNotice(raw);
  if (!notice.enabled || !notice.message) {
    return { message: null, enabled: false };
  }
  return { message: notice.message, enabled: true };
}
