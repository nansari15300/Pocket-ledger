/** In-app OK dialog (replaces window.alert for attachment / sync messages). */

export const APP_ALERT_EVENT = "pl-app-alert";

export type AppAlertDetail = {
  title?: string;
  message: string;
};

export function showAppAlert(message: string, title = "Notice"): void {
  if (typeof window === "undefined") return;
  const detail: AppAlertDetail = {
    title: String(title || "Notice").trim() || "Notice",
    message: String(message || "").trim(),
  };
  if (!detail.message) return;
  window.dispatchEvent(new CustomEvent(APP_ALERT_EVENT, { detail }));
}
