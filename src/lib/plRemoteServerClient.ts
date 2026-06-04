"use client";

const SESSION_KEY = "pl_remote_server_client";
const QUERY_FLAG = "pl_remote_client";

/** Electron client mode: data edits + Firestore sync server PC par hi; yahan sirf UI. */
export function isPlRemoteServerClientMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (sessionStorage.getItem(SESSION_KEY) === "1") return true;
    const q = new URLSearchParams(window.location.search);
    if (q.get(QUERY_FLAG) === "1") {
      sessionStorage.setItem(SESSION_KEY, "1");
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

export function markPlRemoteServerClientMode(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SESSION_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function clearPlRemoteServerClientMode(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export const PL_REMOTE_CLIENT_QUERY = QUERY_FLAG;

export function appendPlRemoteClientQuery(url: string): string {
  try {
    const u = new URL(url);
    u.searchParams.set(QUERY_FLAG, "1");
    return u.toString();
  } catch {
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}${QUERY_FLAG}=1`;
  }
}
