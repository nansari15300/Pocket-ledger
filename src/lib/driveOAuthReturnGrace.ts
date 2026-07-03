"use client";

export const DRIVE_OAUTH_RETURN_GRACE_KEY = "pl-drive-oauth-return-grace";

export type DriveOAuthDecodedState = {
  returnPath?: string;
  uid?: string;
  email?: string;
  formData?: { companyId?: string };
};

export function decodeDriveOAuthStateParam(state: string | null | undefined): DriveOAuthDecodedState | null {
  const raw = String(state || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(atob(raw)) as DriveOAuthDecodedState;
  } catch {
    return null;
  }
}

/** Drive OAuth redirect se pehle — listRecovery / mirror clear se company selection bachao. */
export function markDriveOAuthReturnGrace(companyId: string): void {
  if (typeof window === "undefined") return;
  const id = String(companyId || "").trim();
  if (!id) return;
  try {
    sessionStorage.setItem(
      DRIVE_OAUTH_RETURN_GRACE_KEY,
      JSON.stringify({ companyId: id, at: Date.now() })
    );
  } catch {
    /* ignore */
  }
}

export function readDriveOAuthReturnGrace(companyId: string, maxAgeMs = 90_000): boolean {
  if (typeof window === "undefined") return false;
  const id = String(companyId || "").trim();
  if (!id) return false;
  try {
    const raw = sessionStorage.getItem(DRIVE_OAUTH_RETURN_GRACE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { companyId?: string; at?: number };
    if (String(parsed.companyId || "").trim() !== id) return false;
    const at = typeof parsed.at === "number" ? parsed.at : 0;
    if (!at || Date.now() - at > maxAgeMs) return false;
    return true;
  } catch {
    return false;
  }
}

export function clearDriveOAuthReturnGrace(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(DRIVE_OAUTH_RETURN_GRACE_KEY);
  } catch {
    /* ignore */
  }
}
