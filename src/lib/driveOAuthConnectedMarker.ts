"use client";

const KEY = "pl_drive_oauth_connected_v1";

export type DriveOAuthConnectedMarker = {
  at: number;
  email: string | null;
};

export function markDriveOAuthConnected(email: string | null | undefined): void {
  if (typeof window === "undefined") return;
  try {
    const payload: DriveOAuthConnectedMarker = {
      at: Date.now(),
      email: String(email || "").trim() || null,
    };
    sessionStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function readDriveOAuthConnectedMarker(maxAgeMs = 7 * 24 * 60 * 60 * 1000): DriveOAuthConnectedMarker | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DriveOAuthConnectedMarker;
    const at = typeof parsed.at === "number" ? parsed.at : 0;
    if (!at || Date.now() - at > maxAgeMs) return null;
    return {
      at,
      email: String(parsed.email || "").trim() || null,
    };
  } catch {
    return null;
  }
}
