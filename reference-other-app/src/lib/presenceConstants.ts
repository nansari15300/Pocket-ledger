/**
 * Presence thresholds for stable online/offline display.
 * - Threshold longer than heartbeat so users don't flicker between online/offline.
 */
export const PRESENCE_ONLINE_THRESHOLD_MS = 90 * 1000; // 90 seconds – consider online if lastSeen within this
export const PRESENCE_HEARTBEAT_INTERVAL_MS = 20 * 1000; // 20 seconds – heartbeat interval
