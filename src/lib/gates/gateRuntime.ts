"use client";

import type { Company } from "@/hooks/useCompany";
import { isCloudBackedCompanyShape } from "@/lib/offlineFullWarmSync";
import { isOfflineCompanyStorage } from "@/lib/companyUnlockGate";
import {
  DATA_SOURCE_MODE_STORAGE_KEY,
  type DataSourceMode,
} from "@/lib/dataSourceModeDefaults";
import {
  clearPlRemoteServerClientMode,
  isPlRemoteServerClientMode,
  markPlRemoteServerClientMode,
} from "@/lib/plRemoteServerClient";
import {
  clearPlServerAccessContext,
  applyPlServerAccessContextPayload,
  filterCompaniesForPlServerAccess,
  buildPlServerGatePreviewCompanyList,
  readDevClientAccessToken,
  persistDevClientAccessToken,
  isPlServerSharedCompanyRow,
} from "@/lib/plServerAccessContext";
import { PL_DEV_CLIENT_ACCESS_TOKEN_KEY } from "@/lib/plServerAccessContext";
import {
  BUILTIN_DEVICE_GATE_ID,
  BUILTIN_ONLINE_GATE_ID,
  PL_GATE_CHANGED_EVENT,
  type GateRecord,
} from "@/lib/gates/gateTypes";
import { getActiveGate, writeActiveGateId } from "@/lib/gates/gateStore";
import {
  buildLocalServerConnectUrl,
  fetchGateServerAccessContext,
  type GateServerAccessContext,
} from "@/lib/gates/gateServerFetch";

const LOCAL_API_BASE_KEY = "localApiBaseUrl";

export function dispatchGateChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(PL_GATE_CHANGED_EVENT));
}

function setDataSourceMode(mode: DataSourceMode): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(DATA_SOURCE_MODE_STORAGE_KEY, mode);
}

function setLocalApiBaseUrl(url: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(LOCAL_API_BASE_KEY, url);
}

function persistGateAccessToken(token: string): void {
  if (typeof window === "undefined") return;
  try {
    const t = token.trim();
    if (t) sessionStorage.setItem(PL_DEV_CLIENT_ACCESS_TOKEN_KEY, t);
    else sessionStorage.removeItem(PL_DEV_CLIENT_ACCESS_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

/** Apply active gate to runtime (data source, tokens, remote client flags). */
export function applyActiveGateRuntime(gate: GateRecord): void {
  if (typeof window === "undefined") return;

  switch (gate.type) {
    case "device":
      clearPlRemoteServerClientMode();
      clearPlServerAccessContext();
      persistGateAccessToken("");
      setDataSourceMode("local");
      setLocalApiBaseUrl("http://127.0.0.1:3001");
      break;
    case "online":
      clearPlRemoteServerClientMode();
      clearPlServerAccessContext();
      persistGateAccessToken("");
      setDataSourceMode("firebase");
      break;
    case "local_server": {
      const token = (gate.accessToken || "").trim();
      persistGateAccessToken(token);
      if (gate.serverUrl) setLocalApiBaseUrl(gate.serverUrl);
      setDataSourceMode("local");
      break;
    }
    default:
      break;
  }
  dispatchGateChanged();
}

export function activateGate(gateId: string): GateRecord {
  writeActiveGateId(gateId);
  const gate = getActiveGate();
  applyActiveGateRuntime(gate);
  return gate;
}

/** Refresh server access context for active local_server gate (bundled app). */
export async function refreshActiveLocalServerGateContext(
  gate: GateRecord
): Promise<GateServerAccessContext | null> {
  if (gate.type !== "local_server" || !gate.serverUrl) return null;
  const ctx = await fetchGateServerAccessContext(gate.serverUrl, gate.accessToken || "");
  if (!ctx.error) {
    applyPlServerAccessContextPayload(
      {
        unrestricted: ctx.unrestricted,
        allowedCompanyIds: ctx.allowedCompanyIds,
        label: ctx.label ?? undefined,
        companies: ctx.companies ?? undefined,
      },
      gate.id
    );
    dispatchGateChanged();
  } else if (/invalid|missing token|403/i.test(ctx.error)) {
    clearPlServerAccessContext();
  }
  return ctx;
}

/** EXE/APK bundled shell: server gate activate + SQLite mirror — remote URL par navigate mat. */
export async function activateLocalServerGateOnBundledClient(
  gate: GateRecord
): Promise<{ ok: boolean; message?: string }> {
  if (gate.type !== "local_server" || !gate.serverUrl) {
    return { ok: false, message: "Invalid server gate" };
  }
  const token = resolveLocalServerGateAccessToken(gate);
  if (!token) {
    return {
      ok: false,
      message: "Missing access token — edit this gate and paste the token from the server PC.",
    };
  }
  persistDevClientAccessToken(token);
  writeActiveGateId(gate.id);
  applyActiveGateRuntime({ ...gate, accessToken: token || gate.accessToken });
  const ctx = await refreshActiveLocalServerGateContext({ ...gate, accessToken: token || gate.accessToken });
  if (ctx?.error) return { ok: false, message: ctx.error };
  const { mirrorPlServerGateToLocalSqlite } = await import("@/lib/plServerClientCompanyMirror");
  await mirrorPlServerGateToLocalSqlite(
    { ...gate, accessToken: token || gate.accessToken },
    { pullFullLedger: false }
  ).catch(() => undefined);
  dispatchGateChanged();
  return { ok: true };
}

type PlElectronGateBridge = {
  setRemoteAuth?: (serverUrl: string, accessToken: string) => { ok?: boolean };
};

/** Gate record + session me saved token — connect URL me hamesha bhejo. */
export function resolveLocalServerGateAccessToken(gate: GateRecord): string {
  return (gate.accessToken || "").trim() || readDevClientAccessToken();
}

/** Open remote server in WebView (APK/EXE client path). */
export function navigateToLocalServerGate(gate: GateRecord, companyId?: string): void {
  if (gate.type !== "local_server" || !gate.serverUrl) return;
  const token = resolveLocalServerGateAccessToken(gate);
  if (token) persistDevClientAccessToken(token);
  const url = buildLocalServerConnectUrl(gate.serverUrl, token, companyId);
  markPlRemoteServerClientMode();
  applyActiveGateRuntime({ ...gate, accessToken: token || gate.accessToken });
  writeActiveGateId(gate.id);
  try {
    const bridge = (window as Window & { plElectronGate?: PlElectronGateBridge }).plElectronGate;
    bridge?.setRemoteAuth?.(gate.serverUrl, token);
  } catch {
    /* non-Electron */
  }
  window.location.href = url;
}

/** Back to bundled Capacitor shell from remote server origin. */
export function navigateToBundledDeviceGate(): void {
  activateGate(BUILTIN_DEVICE_GATE_ID);
  if (typeof window !== "undefined") {
    window.location.href = "/";
  }
}

export function isDeviceGate(gate: GateRecord): boolean {
  return gate.type === "device" || gate.id === BUILTIN_DEVICE_GATE_ID;
}

export function isOnlineGate(gate: GateRecord): boolean {
  return gate.type === "online" || gate.id === BUILTIN_ONLINE_GATE_ID;
}

export function isLocalServerGate(gate: GateRecord): boolean {
  return gate.type === "local_server";
}

/** Filter company list for active gate. */
export function filterCompaniesForActiveGate(companies: Company[], gate: GateRecord): Company[] {
  const visible = companies.filter(
    (c) => c && c.isDeleted !== true && c.movedToAdminRecycleAt == null
  );

  if (isDeviceGate(gate)) {
    return visible.filter((c) => isOfflineCompanyStorage(c) && !isCloudBackedCompanyShape(c));
  }

  if (isOnlineGate(gate)) {
    return visible.filter(
      (c) =>
        !isOfflineCompanyStorage(c) ||
        isCloudBackedCompanyShape(c) ||
        String(c.storageOption || "").toLowerCase() === "firebase"
    );
  }

  if (isLocalServerGate(gate)) {
    if (isPlRemoteServerClientMode()) {
      return filterCompaniesForPlServerAccess(visible);
    }
    return buildPlServerGatePreviewCompanyList(visible, gate.id);
  }

  return visible;
}

/** Auto-select: local server gate par device-local (e.g. Drive) ki jagah shared server company prefer karo. */
export function pickGateAwareAutoSelectCompanyId(
  companies: Company[],
  gate?: GateRecord
): string | null {
  if (!companies.length) return null;
  const sorted = [...companies].sort((a, b) => {
    const nameCmp = String(a.name || "").localeCompare(String(b.name || ""), undefined, {
      sensitivity: "base",
    });
    if (nameCmp !== 0) return nameCmp;
    return String(a.id || "").localeCompare(String(b.id || ""));
  });
  const g = gate ?? getActiveGate();
  if (isLocalServerGate(g) || isPlRemoteServerClientMode()) {
    const shared = sorted.filter((c) => isPlServerSharedCompanyRow(c, g.id));
    if (shared.length > 0) return shared[0]!.id;
  }
  return sorted[0]!.id;
}

export function activeGateAllowsCompanyCreate(gate: GateRecord): boolean {
  return isDeviceGate(gate) || isOnlineGate(gate);
}

export function activeGateCreateHint(gate: GateRecord): string {
  if (isDeviceGate(gate)) {
    return "New companies save on this device (local SQLite). Drive sync uses the same company ID.";
  }
  if (isOnlineGate(gate)) {
    return "New companies save to your online account (Firebase).";
  }
  if (isLocalServerGate(gate)) {
    return "Connect to the server to work — create companies on the server PC, or switch to Device / Online gate.";
  }
  return "";
}
