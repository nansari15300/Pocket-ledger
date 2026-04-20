/** Keys for Pocket Ledger web login "Remember email" (password is never stored). */
export const REMEMBER_EMAIL_KEY = "remembered_login_email";
export const REMEMBER_EMAIL_ENABLED_KEY = "remembered_login_email_enabled";

export function readRememberEmailEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(REMEMBER_EMAIL_ENABLED_KEY) === "1";
  } catch {
    return false;
  }
}

export function readRememberedEmail(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(REMEMBER_EMAIL_KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}

/** Drop stored email when user opted out (handles stale keys + post-logout hygiene). */
export function pruneRememberedLoginEmailIfDisabled(): void {
  if (typeof window === "undefined") return;
  try {
    if (window.localStorage.getItem(REMEMBER_EMAIL_ENABLED_KEY) !== "1") {
      window.localStorage.removeItem(REMEMBER_EMAIL_KEY);
    }
  } catch {
    /* ignore */
  }
}
