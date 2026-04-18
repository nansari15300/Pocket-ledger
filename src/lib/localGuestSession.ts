"use client";

/**
 * Local-only guest session for no-login mode.
 * Used when user chooses "Use Local (No Login)".
 */

const LOCAL_GUEST_KEY = "pl_local_guest_enabled";
export const LOCAL_GUEST_EVENT = "pl-local-guest-changed";

export function isLocalGuestEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(LOCAL_GUEST_KEY) === "1";
}

export function enableLocalGuest(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCAL_GUEST_KEY, "1");
  // Auth provider ko turant notify karo so route guard login page par atka na rahe.
  window.dispatchEvent(new CustomEvent(LOCAL_GUEST_EVENT, { detail: { enabled: true } }));
}

export function disableLocalGuest(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(LOCAL_GUEST_KEY);
  // Logout/local-disable ke waqt sync notification.
  window.dispatchEvent(new CustomEvent(LOCAL_GUEST_EVENT, { detail: { enabled: false } }));
}
