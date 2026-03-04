"use client";

import { doc, getDoc, setDoc, getDocs, collection, deleteDoc, serverTimestamp, addDoc, query, orderBy } from "firebase/firestore";
import { firestore } from "@/lib/firebase";

const DEVICE_ID_KEY = "pocket_ledger_device_id";

/**
 * Human-readable device name from user agent (e.g. "Chrome (Windows)", "Safari (iPhone)", "Chrome (Android)").
 * Only available on client; returns "" on server.
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
      // Short/unclear codes (e.g. "K") show as "Mobile" for clarity
      if (part && part.length >= 2 && part.length < 30) return `${browser} (${part})`;
      return `${browser} (Mobile)`;
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
  /** True when slot is full but this user has another device; show "Logout on old device and use this device?" Yes/No. */
  replaceOffer?: boolean;
  /** True when User Can Use Multi Device = Off and shared user tries to use a new device; show "No permission to use multi device. Only one device allowed." */
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

  const deviceLabel = typeof navigator !== "undefined" ? getDeviceLabel() : undefined;
  const doReplaceAndRegister = async () => {
    for (const d of myOtherDevices) {
      await deleteDoc(doc(firestore, "companies", companyId, "devices", d.id));
    }
    await setDoc(doc(firestore, "companies", companyId, "devices", deviceId), {
      userId,
      lastActive: serverTimestamp(),
      deviceType,
      ...(deviceLabel ? { deviceLabel } : {}),
    });
  };

  // User Can Use Multi Device = Off + shared user + this user has other device(s): do not allow new device; show no-permission message
  if (!userCanUseMultiDevice && !isOwner && myOtherDevices.length >= 1 && !existing) {
    return { allowed: false, count: totalCount, limit: maxDevices, isNewDevice: true, singleDeviceOnly: true, noPermissionNewDevice: true };
  }

  if (existing) {
    await setDoc(doc(firestore, "companies", companyId, "devices", deviceId), {
      userId,
      lastActive: serverTimestamp(),
      deviceType,
      ...(deviceLabel ? { deviceLabel } : {}),
    });
    return { allowed: true, count: totalCount, limit: maxDevices, isNewDevice: false };
  }

  // Slot full: if User Can Use Multi Device = Off and shared user has other devices, do not allow (no-permission)
  if (totalCount >= maxDevices && !userCanUseMultiDevice && !isOwner && myOtherDevices.length >= 1) {
    return { allowed: false, count: totalCount, limit: maxDevices, isNewDevice: true, singleDeviceOnly: true, noPermissionNewDevice: true };
  }

  if (totalCount >= maxDevices) {
    const replaceOffer = !isOwner && myOtherDevices.length >= 1;
    return { allowed: false, count: totalCount, limit: maxDevices, isNewDevice: true, replaceOffer: replaceOffer || undefined };
  }

  await setDoc(doc(firestore, "companies", companyId, "devices", deviceId), {
    userId,
    lastActive: serverTimestamp(),
    deviceType,
    ...(deviceLabel ? { deviceLabel } : {}),
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
  const deviceLabel = typeof navigator !== "undefined" ? getDeviceLabel() : undefined;
  await setDoc(doc(firestore, "companies", companyId, "devices", deviceId), {
    userId,
    lastActive: serverTimestamp(),
    deviceType,
    ...(deviceLabel ? { deviceLabel } : {}),
  });
}

/**
 * Add one device_history entry when a device is removed/kicked from the synced list. History only on remove.
 */
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
    const maxHistory = companySnap.data()?.deviceHistoryLimit;
    const maxEntries = typeof maxHistory === "number" && maxHistory >= 1 ? Math.min(1000, maxHistory) : 0;
    if (maxEntries > 0) await trimDeviceHistoryToLimit(companyId, maxEntries);
  } catch {
    // non-blocking
  }
}

/**
 * Trim device_history to at most maxEntries. Keeps newest; deletes oldest.
 */
export async function trimDeviceHistoryToLimit(companyId: string, maxEntries: number): Promise<void> {
  if (maxEntries < 1) return;
  const col = collection(firestore, "companies", companyId, "device_history");
  const snap = await getDocs(query(col, orderBy("createdAt", "asc")));
  if (snap.size <= maxEntries) return;
  const toDeleteCount = snap.size - maxEntries;
  const toDelete = snap.docs.slice(0, toDeleteCount);
  for (const d of toDelete) await deleteDoc(d.ref);
}

/**
 * Remove this device from the company (session kill). Only frees the slot — user is NOT logged out.
 * So: new device can get a slot; this device will need to pass device check again when opening the company.
 */
export async function removeThisDevice(companyId: string): Promise<void> {
  const deviceId = getOrCreateDeviceId();
  if (!deviceId) return;
  const devRef = doc(firestore, "companies", companyId, "devices", deviceId);
  await deleteDoc(devRef);
  // Do NOT write device_commands and do NOT signOut — user stays logged in on this device
}

export { getOrCreateDeviceId };
