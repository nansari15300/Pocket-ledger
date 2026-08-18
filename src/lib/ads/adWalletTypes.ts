export type AdPendingEventType = "reward" | "spend";

export type AdPendingEvent = {
  eventId: string;
  type: AdPendingEventType;
  pointsDelta: number;
  unlockId?: string;
  featureId?: string;
  durationHours?: number;
  expiresAtMs?: number;
  createdAtMs: number;
};

export type AdActiveUnlock = {
  id: string;
  featureId: string;
  expiresAtMs: number;
};

export type AdWalletState = {
  uid: string;
  points: number;
  earnedToday: number;
  dayKey: string;
  pending: AdPendingEvent[];
  unlocks: AdActiveUnlock[];
  lastSyncAtMs: number;
};

export function todayDayKey(now = Date.now()): string {
  const d = new Date(now);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function emptyAdWallet(uid: string, now = Date.now()): AdWalletState {
  return {
    uid,
    points: 0,
    earnedToday: 0,
    dayKey: todayDayKey(now),
    pending: [],
    unlocks: [],
    lastSyncAtMs: 0,
  };
}

export function pruneExpiredUnlocks(wallet: AdWalletState, now = Date.now()): AdWalletState {
  const unlocks = wallet.unlocks.filter((row) => row.expiresAtMs > now);
  if (unlocks.length === wallet.unlocks.length) return wallet;
  return { ...wallet, unlocks };
}

export function rolloverDailyCap(wallet: AdWalletState, now = Date.now()): AdWalletState {
  const dayKey = todayDayKey(now);
  if (wallet.dayKey === dayKey) return wallet;
  return { ...wallet, dayKey, earnedToday: 0 };
}
