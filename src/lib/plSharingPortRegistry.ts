"use client";

import type { LocalAppServerStatus } from "@/lib/electronLocalServer";

const DEFAULT_SHARING_PORTS = new Set(["3001", "37123"]);
const GATE_SERVER_PORTS_KEY = "pl_gate_server_ports_v1";

let cachedAppUiPort: number | null = 3000;
let cachedSharingPort: number | null = null;
let cachedConfiguredPort: number | null = 3001;

function readGateServerPortsFromStorage(): Set<string> {
  const out = new Set<string>();
  if (typeof window === "undefined") return out;
  try {
    const raw = sessionStorage.getItem(GATE_SERVER_PORTS_KEY) || localStorage.getItem(GATE_SERVER_PORTS_KEY);
    if (!raw) return out;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return out;
    for (const p of parsed) {
      const s = String(p || "").trim();
      if (s) out.add(s);
    }
  } catch {
    /* ignore */
  }
  return out;
}

function persistGateServerPorts(ports: Set<string>): void {
  if (typeof window === "undefined") return;
  const list = [...ports];
  try {
    sessionStorage.setItem(GATE_SERVER_PORTS_KEY, JSON.stringify(list));
    localStorage.setItem(GATE_SERVER_PORTS_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

function getCurrentPort(): string {
  if (typeof window === "undefined") return "";
  try {
    const u = new URL(window.location.href);
    return String(u.port || window.location.port || "").trim();
  } catch {
    return String(window.location.port || "").trim();
  }
}

/** Electron status / gate URLs se sharing + app UI ports cache karo. */
export function rememberPlServerPortsFromStatus(status: LocalAppServerStatus | null | undefined): void {
  if (!status) return;
  if (status.appUiPort && status.appUiPort > 0) cachedAppUiPort = status.appUiPort;
  if (status.configuredPort && status.configuredPort > 0) cachedConfiguredPort = status.configuredPort;
  const sharing = status.sharingPort ?? (status.sharingActive ? status.port : null);
  if (sharing && sharing > 0) cachedSharingPort = sharing;
}

export function registerGateServerPortFromUrl(serverUrlRaw: string): void {
  const url = String(serverUrlRaw || "").trim();
  if (!url) return;
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `http://${url}`);
    const port = String(u.port || (u.protocol === "https:" ? "443" : "80")).trim();
    if (!port) return;
    const ports = readGateServerPortsFromStorage();
    ports.add(port);
    persistGateServerPorts(ports);
  } catch {
    /* ignore */
  }
}

export function getCachedAppUiPort(): number | null {
  return cachedAppUiPort;
}

export function getCachedSharingPort(): number | null {
  return cachedSharingPort ?? cachedConfiguredPort;
}

export function getKnownPlSharingProbePorts(): number[] {
  const out = new Set<number>();
  for (const p of DEFAULT_SHARING_PORTS) {
    const n = Number(p);
    if (Number.isFinite(n) && n > 0) out.add(n);
  }
  if (cachedConfiguredPort && cachedConfiguredPort > 0) out.add(cachedConfiguredPort);
  if (cachedSharingPort && cachedSharingPort > 0) out.add(cachedSharingPort);
  for (const p of readGateServerPortsFromStorage()) {
    const n = Number(p);
    if (Number.isFinite(n) && n > 0) out.add(n);
  }
  // App UI 3000 par bhi `/__pl_access_context` ho sakta hai (dev); probe list me rakho.
  if (cachedAppUiPort && cachedAppUiPort > 0) out.add(cachedAppUiPort);
  out.add(3000);
  out.add(3001);
  out.add(37123);
  return [...out];
}

export function isRegisteredPlSharingPort(portRaw: string): boolean {
  const port = String(portRaw || "").trim();
  if (!port) return false;
  if (DEFAULT_SHARING_PORTS.has(port)) return true;
  if (cachedSharingPort != null && String(cachedSharingPort) === port) return true;
  if (cachedConfiguredPort != null && String(cachedConfiguredPort) === port) return true;
  if (readGateServerPortsFromStorage().has(port)) return true;
  return false;
}

export function isCurrentPortAppUi(): boolean {
  const port = getCurrentPort();
  if (!port) return false;
  return cachedAppUiPort != null && port === String(cachedAppUiPort);
}

export function portFromServerUrl(serverUrlRaw: string): string {
  try {
    const href = String(serverUrlRaw || "").trim();
    if (!href) return "";
    const u = new URL(/^https?:\/\//i.test(href) ? href : `http://${href}`);
    return String(u.port || (u.protocol === "https:" ? "443" : "80")).trim();
  } catch {
    return "";
  }
}
