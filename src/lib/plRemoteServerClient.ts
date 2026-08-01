"use client";

import {
  isCurrentPortAppUi,
  isRegisteredPlSharingPort,
  registerGateServerPortFromUrl,
} from "@/lib/plSharingPortRegistry";

const SESSION_KEY = "pl_remote_server_client";
/** Hub UI (`localhost:3000`) — PL server relay, no navigation to sharing URL. */
const HUB_SESSION_KEY = "pl_hub_server_client";
const HUB_PERSIST_KEY = "pl_hub_server_client_v1";
const QUERY_FLAG = "pl_remote_client";

const PL_DEFAULT_SHARING_PORTS = new Set(["3001", "37123"]);

function currentOriginPort(): string {
  if (typeof window === "undefined") return "";
  try {
    const u = new URL(window.location.href);
    return String(u.port || window.location.port || "").trim();
  } catch {
    return String(window.location.port || "").trim();
  }
}

function currentOriginIsLoopback(): boolean {
  if (typeof window === "undefined") return false;
  const host = String(window.location.hostname || "").trim().toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
}

function isDirectPlServerOrigin(): boolean {
  if (typeof window === "undefined") return false;
  const port = currentOriginPort();
  if (!port) return false;
  // Hub app UI (`localhost:3000`) — sharing origin tab nahi jab tak remote client flag na ho.
  if (isCurrentPortAppUi() && !isPlRemoteServerClientMode()) return false;
  if (currentOriginIsLoopback() && !PL_DEFAULT_SHARING_PORTS.has(port) && !isPlRemoteServerClientMode()) return false;
  if (isRegisteredPlSharingPort(port)) return true;
  return PL_DEFAULT_SHARING_PORTS.has(port);
}

export { registerGateServerPortFromUrl };

/** PL sharing server port (3001) — staff thin UI ya host sharing UI; remote mode alag flag se. */
export function isPlSharingServerPortOrigin(): boolean {
  return isDirectPlServerOrigin();
}

/**
 * Staff thin client: Gate → Connect (`pl_remote_client=1`) ya us session ke baad.
 * Sirf port 3001 ≠ staff — host apne server URL par local SQLite login use karta hai.
 */
export function isPlRemoteServerClientMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const q = new URLSearchParams(window.location.search);
    const queryEnabled = q.get(QUERY_FLAG) === "1";
    const localHost = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname.toLowerCase());
    if (sessionStorage.getItem(SESSION_KEY) === "1") {
      if (localHost && !queryEnabled) {
        sessionStorage.removeItem(SESSION_KEY);
      } else {
        return true;
      }
    }
    if (queryEnabled) {
      markPlRemoteServerClientMode();
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

/** Pehle 3001 = auto staff tha — stale session host par galat HTTP login + popup loop. */
export function reconcilePlRemoteServerClientSessionOnLoad(): void {
  if (typeof window === "undefined") return;
  try {
    const q = new URLSearchParams(window.location.search);
    if (q.get(QUERY_FLAG) === "1") return;
    if (isDirectPlServerOrigin() && sessionStorage.getItem(SESSION_KEY) === "1") {
      sessionStorage.removeItem(SESSION_KEY);
    }
  } catch {
    /* ignore */
  }
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

export function isPlHubServerClientMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (sessionStorage.getItem(HUB_SESSION_KEY) === "1") return true;
    return localStorage.getItem(HUB_PERSIST_KEY) === "1";
  } catch {
    return false;
  }
}

export function markPlHubServerClientMode(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(HUB_SESSION_KEY, "1");
    localStorage.setItem(HUB_PERSIST_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function clearPlHubServerClientMode(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(HUB_SESSION_KEY);
    localStorage.removeItem(HUB_PERSIST_KEY);
  } catch {
    /* ignore */
  }
}

/** App reload: persisted hub relay session → sessionStorage restore (active local_server gate). */
export function reconcilePlHubServerClientSessionOnLoad(): void {
  if (typeof window === "undefined") return;
  try {
    if (localStorage.getItem(HUB_PERSIST_KEY) !== "1") return;
    void import("@/lib/gates/gateStore").then(({ getActiveGate }) => {
      const gate = getActiveGate();
      if (gate.type === "local_server" && String(gate.serverUrl || "").trim()) {
        sessionStorage.setItem(HUB_SESSION_KEY, "1");
        return;
      }
      localStorage.removeItem(HUB_PERSIST_KEY);
    });
  } catch {
    /* ignore */
  }
}

/** Sharing-port staff tab ya hub relay client — sync/live guards ke liye. */
export function isPlServerGateClientActive(): boolean {
  return isPlRemoteServerClientMode() || isPlHubServerClientMode();
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

/** Gate → Connect: `/company?pl_remote_client=1&pl_access=…&pl_company=…` — read once, strip from address bar. */
export function readAndStripPlRemoteClientLandingQuery(): {
  hadRemoteClientFlag: boolean;
  accessToken: string | null;
  companyId: string | null;
} {
  if (typeof window === "undefined") {
    return { hadRemoteClientFlag: false, accessToken: null, companyId: null };
  }
  try {
    const u = new URL(window.location.href);
    if (u.searchParams.get(QUERY_FLAG) !== "1") {
      return { hadRemoteClientFlag: false, accessToken: null, companyId: null };
    }
    markPlRemoteServerClientMode();
    const accessToken = (u.searchParams.get("pl_access") || "").trim() || null;
    const companyId = (u.searchParams.get("pl_company") || "").trim() || null;
    u.searchParams.delete(QUERY_FLAG);
    u.searchParams.delete("pl_access");
    u.searchParams.delete("pl_company");
    const clean = `${u.pathname}${u.search}${u.hash}`;
    window.history.replaceState(window.history.state, "", clean);
    return { hadRemoteClientFlag: true, accessToken, companyId };
  } catch {
    return { hadRemoteClientFlag: false, accessToken: null, companyId: null };
  }
}
