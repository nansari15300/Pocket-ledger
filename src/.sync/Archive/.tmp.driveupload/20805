"use client";

import { doc, getDoc, setDoc, getDocs, collection, deleteDoc, serverTimestamp } from "firebase/firestore";
import { firestore } from "@/lib/firebase";

const DEVICE_ID_KEY = "pocket_ledger_device_id";

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
    });
  };

  // User Can Use Multi Device = Off: only registered device(s) allowed. New device = no permission (admin must allow).
  if (!userCanUseMultiDevice && !isOwner && !existing && myOtherDevices.length >= 1) {
    return { allowed: false, count: totalCount, limit: maxDevices, isNewDevice: true, noPermissionNewDevice: true };
  }

  if (existing) {
    await setDoc(doc(firestore, "companies", companyId, "devices", deviceId), {
      userId,
      lastActive: serverTimestamp(),
      deviceType,
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

export { getOrCreateDeviceId };
