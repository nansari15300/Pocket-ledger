"use client";

const STORAGE_KEY_PREFIX = "local-mutation-event:";

// Fan out local IndexedDB mutations to the current tab and other tabs of the same browser session.
export function emitLocalMutationEvent(eventName: string) {
  if (typeof window === "undefined") return;

  window.dispatchEvent(new CustomEvent(eventName));

  try {
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel(eventName);
      channel.postMessage({ at: Date.now() });
      channel.close();
    }
  } catch {
    // BroadcastChannel is best-effort only; storage fallback below still notifies sibling tabs.
  }

  try {
    const storageKey = `${STORAGE_KEY_PREFIX}${eventName}`;
    const payload = String(Date.now());
    window.localStorage.setItem(storageKey, payload);
    window.localStorage.removeItem(storageKey);
  } catch {
    // Some environments block localStorage writes; same-tab custom events still work there.
  }
}

// Subscribe once and listen through custom event, BroadcastChannel, and storage so multi-tab offline UI stays live.
export function subscribeLocalMutationEvent(eventName: string, listener: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handleWindowEvent = () => listener();
  window.addEventListener(eventName, handleWindowEvent);

  let channel: BroadcastChannel | null = null;
  try {
    if (typeof BroadcastChannel !== "undefined") {
      channel = new BroadcastChannel(eventName);
      channel.addEventListener("message", handleWindowEvent);
    }
  } catch {
    channel = null;
  }

  const storageKey = `${STORAGE_KEY_PREFIX}${eventName}`;
  const handleStorageEvent = (event: StorageEvent) => {
    if (event.key === storageKey && event.newValue) {
      listener();
    }
  };
  window.addEventListener("storage", handleStorageEvent);

  return () => {
    window.removeEventListener(eventName, handleWindowEvent);
    window.removeEventListener("storage", handleStorageEvent);
    if (channel) {
      channel.removeEventListener("message", handleWindowEvent);
      channel.close();
    }
  };
}
