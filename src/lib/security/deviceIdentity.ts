"use client";

/** localStorage key — device binding + signed entitlement `device` claim ke liye stable id. */
const DEVICE_ID_KEY = "pocket-ledger:clientDeviceId:v1";

/**
 * Har install/browser profile ke liye ek UUID — entitlement JWS me `device` claim + future server-side dedupe.
 * Browser me yeh secret nahi hai, sirf identifier (spoof possible — server rate-limit / device table se mitigate).
 */
export function getOrCreateClientDeviceId(): string {
  if (typeof window === "undefined") return "ssr_no_device";
  try {
    const existing = window.localStorage.getItem(DEVICE_ID_KEY)?.trim();
    if (existing) return existing;
    const id =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `dev_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
    window.localStorage.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch {
    return `ephemeral_${Date.now()}`;
  }
}
