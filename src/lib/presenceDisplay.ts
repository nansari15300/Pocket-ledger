"use client";

import { PRESENCE_ONLINE_THRESHOLD_MS } from "@/lib/presenceConstants";

/** Firestore `Timestamp` / number / seconds — admin list + UserCard ke liye stable millis. */
export function lastSeenMsFromUserField(lastSeen: unknown): number | null {
  if (lastSeen == null) return null;
  try {
    const ts = lastSeen as { toDate?: () => Date; seconds?: number; nanoseconds?: number };
    if (typeof ts.toDate === "function") {
      const d = ts.toDate();
      const t = d?.getTime?.();
      return typeof t === "number" && !Number.isNaN(t) ? t : null;
    }
    if (typeof lastSeen === "number" && Number.isFinite(lastSeen)) return lastSeen;
    if (ts.seconds != null) return ts.seconds * 1000 + Math.floor((ts.nanoseconds ?? 0) / 1e6);
  } catch {
    /* invalid snapshot field */
  }
  return null;
}

/**
 * `voidUpdateUserPresence` `online` + `lastSeen` dono likhta hai — sirf `lastSeen` se kabhi client clock / pending write par glitch.
 * `online === false` (tab band) par seedha offline.
 */
export function computePresenceLooksOnline(data: { online?: unknown; lastSeen?: unknown }): boolean {
  if (data.online === false) return false;
  const t = lastSeenMsFromUserField(data.lastSeen);
  const recent = t != null && Date.now() - t < PRESENCE_ONLINE_THRESHOLD_MS;
  if (data.online === true) return recent;
  return recent;
}
