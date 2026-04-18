"use client";

/**
 * Notification sidebar/badges — har device par logged-in user ke hisaab se (Firestore sync ki zaroorat nahi).
 * Key: companyId + Firebase uid; company doc `notificationSettings` sirf fallback jab user ne save na kiya ho.
 */
import type { NotificationSettings } from "@/hooks/useCompany";

const STORAGE_VER = "v1";
const EVT = "pl-notification-prefs-changed";

function storageKey(companyId: string, userId: string): string {
  return `pl_notif_${STORAGE_VER}_${encodeURIComponent(companyId)}_${encodeURIComponent(userId)}`;
}

/** Same-tab updates: `storage` event fires only across tabs */
export function dispatchNotificationPrefsChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(EVT));
}

function deepDefaultNotificationSettings(): NotificationSettings {
  return {
    approve: {
      on: true,
      onEntity: true,
      onList: true,
      onTransaction: true,
    },
    message: {
      on: true,
      onEntity: true,
      onList: true,
      onTransaction: false,
    },
    transactionAlerts: {
      on: true,
      onEntity: true,
      onTabs: true,
      onList: true,
    },
  };
}

/** Firestore / SQLite company row se read kiya hua shape — partial ho sakta hai */
export function mergeNotificationLayer(
  base: NotificationSettings | undefined,
  override: NotificationSettings | undefined
): NotificationSettings {
  const d = deepDefaultNotificationSettings();
  const a = base ?? {};
  const b = override ?? {};
  return {
    approve: {
      on: b.approve?.on ?? a.approve?.on ?? d.approve!.on,
      onEntity: b.approve?.onEntity ?? a.approve?.onEntity ?? d.approve!.onEntity,
      onList: b.approve?.onList ?? a.approve?.onList ?? d.approve!.onList,
      onTransaction: b.approve?.onTransaction ?? a.approve?.onTransaction ?? d.approve!.onTransaction,
    },
    message: {
      on: b.message?.on ?? a.message?.on ?? d.message!.on,
      onEntity: b.message?.onEntity ?? a.message?.onEntity ?? d.message!.onEntity,
      onList: b.message?.onList ?? a.message?.onList ?? d.message!.onList,
      onTransaction: b.message?.onTransaction ?? a.message?.onTransaction ?? d.message!.onTransaction,
    },
    transactionAlerts: {
      on: b.transactionAlerts?.on ?? a.transactionAlerts?.on ?? d.transactionAlerts!.on,
      onEntity: b.transactionAlerts?.onEntity ?? a.transactionAlerts?.onEntity ?? d.transactionAlerts!.onEntity,
      onTabs: b.transactionAlerts?.onTabs ?? a.transactionAlerts?.onTabs ?? d.transactionAlerts!.onTabs,
      onList: b.transactionAlerts?.onList ?? a.transactionAlerts?.onList ?? d.transactionAlerts!.onList,
    },
  };
}

export function readLocalUserNotificationSettings(
  companyId: string | null | undefined,
  userId: string | null | undefined
): NotificationSettings | null {
  if (typeof window === "undefined" || !companyId?.trim() || !userId?.trim()) return null;
  try {
    const raw = localStorage.getItem(storageKey(companyId.trim(), userId.trim()));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    return mergeNotificationLayer(undefined, parsed as NotificationSettings);
  } catch {
    return null;
  }
}

export function writeLocalUserNotificationSettings(
  companyId: string,
  userId: string,
  settings: NotificationSettings
): void {
  if (typeof window === "undefined" || !companyId.trim() || !userId.trim()) return;
  try {
    localStorage.setItem(storageKey(companyId.trim(), userId.trim()), JSON.stringify(settings));
    dispatchNotificationPrefsChanged();
  } catch {
    /* quota / private mode */
  }
}

/** UI: local user > company doc > defaults */
export function getEffectiveNotificationSettings(
  company: { notificationSettings?: NotificationSettings } | null,
  userId: string | null | undefined,
  companyId: string | null | undefined
): NotificationSettings {
  const fromCompany = company?.notificationSettings;
  const local = readLocalUserNotificationSettings(companyId, userId);
  return mergeNotificationLayer(fromCompany, local ?? undefined);
}

export const NOTIFICATION_PREFS_CHANGED_EVENT = EVT;
