import type { AdSettings } from "@/lib/adSettings";

export function pointsForCompletedAdSeconds(settings: AdSettings, elapsedSeconds: number): number {
  const enabled = settings.rewardTiers
    .filter((tier) => tier.enabled)
    .sort((a, b) => b.minimumSeconds - a.minimumSeconds);
  const match = enabled.find((tier) => elapsedSeconds >= tier.minimumSeconds);
  return match ? Math.max(0, Math.floor(match.points)) : 0;
}

export function capDailyEarn(earnedToday: number, add: number, dailyMax: number): number {
  const max = Math.max(0, Math.floor(dailyMax));
  const already = Math.max(0, Math.floor(earnedToday));
  const delta = Math.max(0, Math.floor(add));
  if (already >= max) return 0;
  return Math.min(delta, max - already);
}

export function newAdEventId(): string {
  const rand =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `ad_${rand}`;
}
