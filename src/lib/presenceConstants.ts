/**
 * Presence thresholds for stable online/offline display.
 * - Threshold longer than heartbeat so users don't flicker between online/offline.
 */
export const PRESENCE_ONLINE_THRESHOLD_MS = 180 * 1000; // 180 seconds - consider online if lastSeen within this (3x heartbeat)
export const PRESENCE_HEARTBEAT_INTERVAL_MS = 60 * 1000; // 60 seconds - heartbeat interval (visible tab only)
