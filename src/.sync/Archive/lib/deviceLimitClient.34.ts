"use client";

import { doc, getDoc, setDoc, getDocs, collection, deleteDoc, serverTimestamp, addDoc, query, orderBy, limit } from "firebase/firestore";
import { firestore } from "@/lib/firebase";

const HISTORY_COOLDOWN_MS = 60 * 1000;
const HISTORY_COOLDOWN_KEY = "pl_device_history_last";
async function _unusedAddDeviceHistoryEntry(companyId: string, deviceId: string, userId: string, deviceType: "mobile" | "desktop", deviceLabel?: string): Promise<void> {
  try {
    if (typeof localStorage !== "undefined") {
      const key = `${HISTORY_COOLDOWN_KEY}_${companyId}`;
      const last = parseInt(localStorage.getItem(key) ?? "0", 10);
      if (Date.now() - last < HISTORY_COOLDOWN_MS) return; // skip if we added recently for this company
    }
    await addDoc(collection(firestore, "companies", companyId, "device_history"), {
      deviceId,
      userId,
      lastActive: serverTimestamp(),
      deviceType,
      ...(deviceLabel ? { deviceLabel } : {}),
      createdAt: serverTimestamp(),
    });
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(`${HISTORY_COOLDOWN_KEY}_${companyId}`, String(Date.now()));
    }
    // Trim so count doesn’t stay over limit (read limit from company doc)
    const companySnap = await getDoc(doc(firestore, "companies", companyId));
    const limit = companySnap.data()?.deviceHistoryLimit;
    const maxEntries = typeof limit === "number" && limit >= 1 ? Math.min(1000, limit) : 0;
    if (maxEntries > 0) await trimDeviceHistoryToLimit(companyId, maxEntries);
  } catch {
    // non-blocking
  }
}

/** Add one device_history entry when a device is removed/kicked from synced list. History only on remove, not on connect. */
export async function addDeviceHistoryEntryWhenRemoved(
  companyId: string,
  device: { id: string; userId: string; deviceType?: "mobile" | "desktop"; deviceLabel?: string }
): Promise<void> {
  try {
    const deviceType = device.deviceType ?? "desktop";
    await addDoc(collection(firestore, "companies", companyId, "device_history"), {
      deviceId: device.id,
      userId: device.userId,
      lastActive: serverTimestamp(),
      deviceType,
      ...(device.deviceLabel ? { deviceLabel: device.deviceLabel } : {}),
      createdAt: serverTimestamp(),
    });
    const companySnap = await getDoc(doc(firestore, "companies", companyId));
    const limit = companySnap.data()?.deviceHistoryLimit;
    const maxEntries = typeof limit === "number" && limit >= 1 ? Math.min(1000, limit) : 0;
    if (maxEntries > 0) await trimDeviceHistoryToLimit(companyId, maxEntries);
  } catch {
    // non-blocking
  }
}

const DEVICE_ID_KEY = "pocket_ledger_device_id";

/**
 * Human-readable device label from User-Agent (e.g. "Chrome (Windows)", "Safari (iPhone)", "Chrome (Android)").
 * Browser cannot access real PC name or exact phone model for security.
 */
export function getDeviceLabel(): string {
  if (typeof navigator === "undefined" || !navigator.userAgent) return "";
  const ua = navigator.userAgent;
  const isMobile = /Mobile|Android|iPhone|iPad|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  let browser = "Browser";
  if (ua.includes("Edg/")) browser = "Edge";
  else if (ua.includes("SamsungBrowser")) browser = "Samsung Internet";
  else if (ua.includes("Chrome") && !ua.includes("Edg")) browser = "Chrome";
  else if (ua.includes("Firefox")) browser = "Firefox";
  else if (ua.includes("Safari") && !ua.includes("Chrome")) browser = "Safari";
  else if (ua.includes("Opera") || ua.includes("OPR")) browser = "Opera";
  if (isMobile) {
    if (/iPhone|iPad/i.test(ua)) return `${browser} (${/iPad/.test(ua) ? "iPad" : "iPhone"})`;
    if (/Android/i.test(ua)) {
      const m = ua.match(/Android\s*[^;]*;\s*([^)]+)\)/);
      const part = m ? m[1].trim() : "";
      if (part && part.length < 30) return `${browser} (${part})`;
      return `${browser} (Android)`;
    }
    return `${browser} (Mobile)`;
  }
  if (/Windows/i.test(ua)) return `${browser} (Windows)`;
  if (/Mac OS X|Macintosh/i.test(ua)) return `${browser} (Mac)`;
  if (/Linux/i.test(ua)) return `${browser} (Linux)`;
  return browser;
}

function getOrCreateDeviceId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `dev_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

export type DeviceLimitResult = {
  allowed: boolean;
  count: number;
  limit: number;
  isNewDevice: boolean;
  singleDeviceOnly?: boolean;
  /** True when slot is full but this user has another device; show replace Yes/No (only when User Can Use Multi Device = On). */
  replaceOffer?: boolean;
  /** True when User Can Use Multi Device = Off and this user has another device; show "No permission to change to new device by company admin". */
  noPermissionNewDevice?: boolean;
};

/**
 * Register current device for the company and check if within plan limit.
 * Call when user has company selected. Returns allowed: false when over limit (new device and count >= maxDevices).
 * When userCanUseMultiDevice is false and user is not owner, shared user can only have one device (singleDeviceOnly).
 */
export async function registerDeviceAndCheckLimit(
  companyId: string,
  userId: string,
  maxDevices: number,
  hasMultiDeviceSync: boolean,
  options?: { userCanUseMultiDevice?: boolean; isOwner?: boolean }
): Promise<DeviceLimitResult> {
  if (maxDevices < 1) {
    return { allowed: true, count: 1, limit: 1, isNewDevice: false };
  }
  if (!hasMultiDeviceSync) {
    return { allowed: true, count: 1, limit: maxDevices || 1, isNewDevice: false };
  }

  const deviceId = getOrCreateDeviceId();
  if (!deviceId) return { allowed: true, count: 1, limit: maxDevices, isNewDevice: false };

  const deviceType = typeof navigator !== "undefined" && /Mobile|Android|iPhone|iPad|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ? "mobile" : "desktop";

  const [companySnap, allDevicesSnap] = await Promise.all([
    getDoc(doc(firestore, "companies", companyId)),
    getDocs(collection(firestore, "companies", companyId, "devices")),
  ]);
  const companyData = companySnap.data();
  const userCanUseMultiDevice = companyData?.userCanUseMultiDevice !== false;
  const isOwner = options?.isOwner === true;

  const totalCount = allDevicesSnap.size;
  const existing = allDevicesSnap.docs.find((d) => d.id === deviceId);
  const myOtherDevices = allDevicesSnap.docs.filter((d) => d.data()?.userId === userId && d.id !== deviceId);

  const doReplaceAndRegister = async () => {
    for (const d of myOtherDevices) {
      await deleteDoc(doc(firestore, "companies", companyId, "devices", d.id));
    }
    await setDoc(doc(firestore, "companies", companyId, "devices", deviceId), {
      userId,
      lastActive: serverTimestamp(),
      deviceType,
      deviceLabel: getDeviceLabel(),
    });
  };

  // User Can Use Multi Device = Off: only registered device(s) allowed. New device = no permission (admin must allow).
  if (!userCanUseMultiDevice && !isOwner && !existing && myOtherDevices.length >= 1) {
    return { allowed: false, count: totalCount, limit: maxDevices, isNewDevice: true, noPermissionNewDevice: true };
  }

  if (existing) {
    // Only update lastActive at most every 5 min so "Last active" doesn’t change every 45s; never add history here (device change only).
    const lastActiveTs = existing.data()?.lastActive as { toMillis?: () => number } | undefined;
    const lastMs = typeof lastActiveTs?.toMillis === "function" ? lastActiveTs.toMillis() : 0;
    const fiveMinMs = 5 * 60 * 1000;
    if (Date.now() - lastMs < fiveMinMs) {
      return { allowed: true, count: totalCount, limit: maxDevices, isNewDevice: false };
    }
    await setDoc(doc(firestore, "companies", companyId, "devices", deviceId), {
      userId,
      lastActive: serverTimestamp(),
      deviceType,
      deviceLabel: getDeviceLabel(),
    });
    return { allowed: true, count: totalCount, limit: maxDevices, isNewDevice: false };
  }

  // Slot full
  if (totalCount >= maxDevices) {
    if (!userCanUseMultiDevice && !isOwner && myOtherDevices.length >= 1) {
      return { allowed: false, count: totalCount, limit: maxDevices, isNewDevice: true, noPermissionNewDevice: true };
    }
    const replaceOffer = userCanUseMultiDevice && !isOwner && myOtherDevices.length >= 1;
    return { allowed: false, count: totalCount, limit: maxDevices, isNewDevice: true, replaceOffer: replaceOffer || undefined };
  }

  // Slot free but User Can Use Multi Device = Off and this user already has a device: do not allow new device
  if (!userCanUseMultiDevice && !isOwner && myOtherDevices.length >= 1) {
    return { allowed: false, count: totalCount, limit: maxDevices, isNewDevice: true, noPermissionNewDevice: true };
  }

  await setDoc(doc(firestore, "companies", companyId, "devices", deviceId), {
    userId,
    lastActive: serverTimestamp(),
    deviceType,
    deviceLabel: getDeviceLabel(),
  });
  return { allowed: true, count: totalCount + 1, limit: maxDevices, isNewDevice: true };
}

/**
 * Remove this user's other devices and register current device. Call when user confirms "Yes" on replace-offer dialog.
 */
export async function replaceMyOtherDevicesAndRegister(companyId: string, userId: string): Promise<void> {
  const deviceId = getOrCreateDeviceId();
  if (!deviceId) return;
  const deviceType = typeof navigator !== "undefined" && /Mobile|Android|iPhone|iPad|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ? "mobile" : "desktop";
  const snap = await getDocs(collection(firestore, "companies", companyId, "devices"));
  const myOther = snap.docs.filter((d) => d.data()?.userId === userId && d.id !== deviceId);
  for (const d of myOther) {
    await deleteDoc(doc(firestore, "companies", companyId, "devices", d.id));
  }
  await setDoc(doc(firestore, "companies", companyId, "devices", deviceId), {
    userId,
    lastActive: serverTimestamp(),
    deviceType,
    deviceLabel: getDeviceLabel(),
  });
}

/**
 * Remove this device from the company (session kill). Only frees the slot — user is NOT logged out.
 * If this device was never registered (e.g. no-permission screen), doc does not exist — skip delete to avoid permission error.
 */
export async function removeThisDevice(companyId: string): Promise<void> {
  const deviceId = getOrCreateDeviceId();
  if (!companyId || !deviceId) return;
  const devRef = doc(firestore, "companies", companyId, "devices", deviceId);
  const snap = await getDoc(devRef);
  if (!snap.exists()) return; // never registered — nothing to remove; deleteDoc would fail permission (resource == null)
  await deleteDoc(devRef);
}

/**
 * Trim device_history to at most `maxEntries`. Deletes oldest entries in batches; keeps newest maxEntries.
 */
export async function trimDeviceHistoryToLimit(companyId: string, maxEntries: number): Promise<void> {
  if (maxEntries < 1) return;
  const col = collection(firestore, "companies", companyId, "device_history");
  const batchSize = 100;
  while (true) {
    const q = query(col, orderBy("createdAt", "asc"), limit(batchSize));
    const snap = await getDocs(q);
    if (snap.size === 0) break;
    const toDelete = snap.size < batchSize
      ? snap.docs.slice(0, Math.max(0, snap.size - maxEntries))
      : snap.docs;
    if (toDelete.length === 0) break;
    for (const d of toDelete) {
      await deleteDoc(d.ref);
    }
    if (snap.size < batchSize) break;
  }
}

export { getOrCreateDeviceId };
