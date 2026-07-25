"use client";

import { getActiveGate } from "@/lib/gates/gateStore";
import { isLocalAppServerHost } from "@/lib/localAppServerDevPreview";
import {
  isPlHubServerClientMode,
  isPlRemoteServerClientMode,
  isPlServerGateClientActive,
  isPlSharingServerPortOrigin,
} from "@/lib/plRemoteServerClient";

const APP_HUB_ORIGIN_KEY = "pl_app_hub_origin";
const APP_HUB_ORIGIN_PERSIST_KEY = "pl_app_hub_origin_v1";
const GATE_ID_QUERY = "pl_gate_id";
const GATE_LABEL_QUERY = "pl_gate_label";
const GATE_SERVER_URL_QUERY = "pl_gate_server_url";

/** App UI origin (`:3000`, EXE localhost bundle) — PL server gate sirf "Open gate" link. */
export function isAppUiOrigin(): boolean {
  if (typeof window === "undefined") return true;
  return !isPlSharingServerPortOrigin();
}

/** Staff / remote user on sharing server (`:3001` + `pl_remote_client`). */
export function isPlGateRemoteStaffOrigin(): boolean {
  if (typeof window === "undefined") return false;
  return isPlSharingServerPortOrigin() && isPlRemoteServerClientMode();
}

/** Hub par gate detail tab tak chhupa jab tak relay connect na ho. */
export function shouldHideLocalServerGateDetailOnHub(): boolean {
  return isAppUiOrigin() && !isPlHubServerClientMode();
}

function isLoopbackHostname(hostname: string): boolean {
  const h = String(hostname || "").toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
}

/** Gate URL remote Host (LAN IP) pe point karti hai — bundled staff EXE/APK. */
export function gatePointsAtRemotePlServerHost(serverUrl: string | null | undefined): boolean {
  try {
    const raw = String(serverUrl || "").trim();
    if (!raw) return false;
    const u = new URL(raw.includes("://") ? raw : `http://${raw}`);
    return Boolean(u.hostname && !isLoopbackHostname(u.hostname));
  } catch {
    return false;
  }
}

/** Bundled app UI par staff client — local_server gate + remote server URL (host self-loopback nahi). */
export function isPlServerStaffOnAppUiOrigin(): boolean {
  if (typeof window === "undefined" || !isAppUiOrigin()) return false;
  if (isPlHubServerClientMode() || isPlRemoteServerClientMode()) return false;
  const gate = getActiveGate();
  if (gate.type !== "local_server") return false;
  const url = String(gate.serverUrl || "").trim();
  if (!url) return false;
  if (!isLocalAppServerHost()) return true;
  return gatePointsAtRemotePlServerHost(url);
}

/** Continuous live pull — hub relay client, sharing port, remote staff tab, ya bundled staff EXE/APK. */
export function shouldRunPlServerContinuousLiveSync(): boolean {
  if (typeof window === "undefined") return false;
  if (isPlHubServerClientMode()) return true;
  if (isPlGateRemoteStaffOrigin()) return true;
  if (isPlSharingServerPortOrigin()) return true;
  if (isPlServerStaffOnAppUiOrigin()) return true;
  if (isAppUiOrigin()) return false;
  return false;
}

/** Test fail — server-side vs client-side hint for toast. */
export function describePlGateTestFailure(message: string): string {
  const m = String(message || "").toLowerCase();
  if (
    m.includes("timeout") ||
    m.includes("timed out") ||
    m.includes("cannot reach") ||
    m.includes("econnrefused") ||
    m.includes("failed to fetch") ||
    m.includes("network") ||
    m.includes("pl_server_get_timeout")
  ) {
    return `${message} — Server side: sharing ON + correct port + firewall. Client side: same Wi‑Fi / correct IP.`;
  }
  if (m.includes("401") || m.includes("403") || m.includes("invalid") || m.includes("token")) {
    return `${message} — Server responded; check server sharing / access on host PC.`;
  }
  if (m.includes("no shared companies")) {
    return `${message} — Server reachable; tick companies to share on host PC.`;
  }
  return message;
}

export function rememberAppHubOrigin(origin?: string): void {
  if (typeof window === "undefined") return;
  try {
    const o = (origin || window.location.origin || "").trim();
    if (!o) return;
    sessionStorage.setItem(APP_HUB_ORIGIN_KEY, o);
    localStorage.setItem(APP_HUB_ORIGIN_PERSIST_KEY, o);
  } catch {
    /* ignore */
  }
}

export function resolveAppHubOrigin(): string {
  if (typeof window === "undefined") return "";
  try {
    const stored =
      sessionStorage.getItem(APP_HUB_ORIGIN_KEY)?.trim() ||
      localStorage.getItem(APP_HUB_ORIGIN_PERSIST_KEY)?.trim();
    if (stored) return stored;
  } catch {
    /* ignore */
  }
  try {
    const { hostname, protocol } = window.location;
    const host = hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") {
      return `${protocol}//127.0.0.1:3000`;
    }
  } catch {
    /* ignore */
  }
  return "";
}

export function readAndStripPlGateLandingQuery(): {
  gateId: string | null;
  gateLabel: string | null;
  serverUrl: string | null;
} {
  if (typeof window === "undefined") {
    return { gateId: null, gateLabel: null, serverUrl: null };
  }
  try {
    const u = new URL(window.location.href);
    const gateId = (u.searchParams.get(GATE_ID_QUERY) || "").trim() || null;
    const gateLabel = (u.searchParams.get(GATE_LABEL_QUERY) || "").trim() || null;
    const serverUrl = (u.searchParams.get(GATE_SERVER_URL_QUERY) || "").trim() || null;
    if (gateId || gateLabel || serverUrl) {
      u.searchParams.delete(GATE_ID_QUERY);
      u.searchParams.delete(GATE_LABEL_QUERY);
      u.searchParams.delete(GATE_SERVER_URL_QUERY);
      const clean = `${u.pathname}${u.search}${u.hash}`;
      window.history.replaceState(window.history.state, "", clean);
    }
    return { gateId, gateLabel, serverUrl };
  } catch {
    return { gateId: null, gateLabel: null, serverUrl: null };
  }
}

export function appendPlGateLandingParams(
  gatePageUrl: string,
  gate: { id: string; label?: string | null; serverUrl?: string | null }
): string {
  try {
    const u = new URL(gatePageUrl);
    u.searchParams.set(GATE_ID_QUERY, gate.id);
    const label = String(gate.label || "").trim();
    if (label) u.searchParams.set(GATE_LABEL_QUERY, label);
    const serverUrl = String(gate.serverUrl || "").trim();
    if (serverUrl) u.searchParams.set(GATE_SERVER_URL_QUERY, serverUrl);
    return u.toString();
  } catch {
    return gatePageUrl;
  }
}
