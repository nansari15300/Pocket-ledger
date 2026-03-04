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
  /** True when shared user has another device and company has userCanUseMultiDevice false (single device per shared user). */
  singleDeviceOnly?: boolean;
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
      await setDoc(doc(firestore, "companies", companyId, "device_commands", d.id), { logout: true, at: serverTimestamp() });
    }
    await setDoc(doc(firestore, "companies", companyId, "devices", deviceId), {
      userId,
      lastActive: serverTimestamp(),
      deviceType,
    });
  };

  // User Can Use Multi Device = Off + shared user + this user has other device(s): auto-replace and allow
  if (!userCanUseMultiDevice && !isOwner && !existing && myOtherDevices.length >= 1) {
    await doReplaceAndRegister();
    return { allowed: true, count: totalCount - myOtherDevices.length + 1, limit: maxDevices, isNewDevice: true };
  }

  if (existing) {
    await setDoc(doc(firestore, "companies", companyId, "devices", deviceId), {
      userId,
      lastActive: serverTimestamp(),
      deviceType,
    });
    return { allowed: true, count: totalCount, limit: maxDevices, isNewDevice: false };
  }

  // Slot full: if User Can Use Multi Device = Off and this shared user has other devices, replace and allow
  if (totalCount >= maxDevices && !userCanUseMultiDevice && !isOwner && myOtherDevices.length >= 1) {
    try {
      await doReplaceAndRegister();
      return { allowed: true, count: totalCount - myOtherDevices.length + 1, limit: maxDevices, isNewDevice: true };
    } catch {
      return { allowed: false, count: totalCount, limit: maxDevices, isNewDevice: true };
    }
  }

  if (totalCount >= maxDevices) {
    return { allowed: false, count: totalCount, limit: maxDevices, isNewDevice: true };
  }

  await setDoc(doc(firestore, "companies", companyId, "devices", deviceId), {
    userId,
    lastActive: serverTimestamp(),
    deviceType,
  });
  return { allowed: true, count: totalCount + 1, limit: maxDevices, isNewDevice: true };
}

export { getOrCreateDeviceId };
