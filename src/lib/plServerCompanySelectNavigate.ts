"use client";

import type { Company } from "@/hooks/useCompany";
import { resolveServerGateForCompany } from "@/lib/companySelectorGateLabel";
import { isServerGateCompany } from "@/lib/companyStorageKind";
import {
  applyActiveGateRuntime,
  registerElectronRemoteGateOrigin,
  resolveLocalServerGateAccessToken,
} from "@/lib/gates/gateRuntime";
import { buildLocalServerConnectUrl, resolvePlSharingServerUrlForGate, resolvePlSharingTransportUrl } from "@/lib/gates/gateServerFetch";
import { normalizeServerUrl, writeActiveGateId } from "@/lib/gates/gateStore";
import type { GateRecord } from "@/lib/gates/gateTypes";
import { isEmbeddedMobileShell } from "@/lib/isCapacitorNative";
import { isElectronDesktopApp } from "@/lib/isElectronDesktop";
import {
  appendPlFirebaseHandoffToConnectUrl,
  fetchPlFirebaseHandoffCustomToken,
} from "@/lib/plFirebaseAuthHandoff";
import {
  appendPlGateLandingParams,
  isAppUiOrigin,
  rememberAppHubOrigin,
  resolveAppHubOrigin,
} from "@/lib/plGatePageOrigin";
import { plGateTrace } from "@/lib/plGateTrace";
import {
  isPlHubServerClientMode,
  isPlRemoteServerClientMode,
  isPlSharingServerPortOrigin,
  markPlRemoteServerClientMode,
} from "@/lib/plRemoteServerClient";
import { persistDevClientAccessToken } from "@/lib/plServerAccessContext";

type PlElectronGateBridge = {
  setRemoteAuth?: (serverUrl: string, accessToken: string) => { ok?: boolean };
};

type PlElectronTabBridge = {
  openUrlInNewTab?: (url: string) => Promise<{ ok?: boolean }>;
};

export type PlServerCompanyOpenResult = "opened_new_tab" | "navigated_same_window" | "skipped" | "popup_blocked";

/** Web + EXE hub UI: same tab; mobile: same WebView URL change. Sharing-port staff tab: legacy new tab. */
export function shouldOpenPlServerCompanyInNewTab(): boolean {
  if (typeof window === "undefined") return false;
  if (isEmbeddedMobileShell()) return false;
  if (isAppUiOrigin() && !isPlRemoteServerClientMode()) return false;
  return true;
}

function gateFromCompanyServerUrl(company: Company): GateRecord | null {
  const url = normalizeServerUrl(String((company as { plServerGateServerUrl?: string }).plServerGateServerUrl || "").trim());
  if (!url) return null;
  return {
    id: `pl_server_url:${url}`,
    type: "local_server",
    label: "Server",
    serverUrl: url,
    createdAtMs: Date.now(),
  };
}

function resolveGateForServerCompany(company: Company, gateOverride?: GateRecord | null): GateRecord | null {
  if (gateOverride?.type === "local_server" && gateOverride.serverUrl) return gateOverride;
  return (
    resolveServerGateForCompany(company as Company & { plServerGateId?: string; plServerGateServerUrl?: string }) ??
    gateFromCompanyServerUrl(company)
  );
}

function gateFromServerUrlOnly(serverUrlRaw: string, label = "Server"): GateRecord | null {
  const url = normalizeServerUrl(serverUrlRaw);
  if (!url) return null;
  return {
    id: `pl_server_url:${url}`,
    type: "local_server",
    label,
    serverUrl: url,
    createdAtMs: Date.now(),
  };
}

function isSameBrowserOrigin(serverUrlRaw: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const base = normalizeServerUrl(serverUrlRaw);
    if (!base) return false;
    const target = new URL(/^https?:\/\//i.test(base) ? base : `http://${base}`).origin;
    return target === window.location.origin;
  } catch {
    return false;
  }
}

function shouldSkipPlServerSelectRedirect(): boolean {
  return isPlSharingServerPortOrigin() && !isPlRemoteServerClientMode();
}

/** Hub app UI (`localhost:3000`): server company in-place — relay se, sharing URL mat kholo. */
function shouldUnlockPlServerCompanyInPlaceOnHub(company: Company, gate: GateRecord | null): boolean {
  if (typeof window === "undefined") return false;
  if (!isAppUiOrigin()) return false;
  if (isPlRemoteServerClientMode()) return false;
  if (gate?.serverUrl) return true;
  const url = normalizeServerUrl(String((company as { plServerGateServerUrl?: string }).plServerGateServerUrl || ""));
  return Boolean(url);
}

function persistGateSelection(gate: GateRecord | null): void {
  if (!gate || gate.id.startsWith("pl_server_url:")) return;
  writeActiveGateId(gate.id);
}

async function buildPlServerConnectUrl(
  gate: GateRecord,
  companyId?: string | null
): Promise<{ url: string; sharingUrl: string; token: string } | null> {
  const serverUrlRaw = normalizeServerUrl(gate.serverUrl || "");
  if (!serverUrlRaw) return null;

  const resolved = await resolvePlSharingServerUrlForGate(serverUrlRaw, "", { timeoutMs: 12_000 }).catch(() => null);
  const sharingUrl = normalizeServerUrl(resolved?.url || serverUrlRaw);
  const transportUrl = resolvePlSharingTransportUrl(resolved, serverUrlRaw);
  if (!sharingUrl || !transportUrl) return null;

  const token = resolveLocalServerGateAccessToken(gate);
  let url = buildLocalServerConnectUrl(transportUrl, token, companyId?.trim() || undefined);
  const firebaseHandoff = await fetchPlFirebaseHandoffCustomToken();
  if (firebaseHandoff) {
    url = appendPlFirebaseHandoffToConnectUrl(url, firebaseHandoff);
  }
  return { url, sharingUrl: transportUrl, token };
}

async function openPlServerConnectTarget(
  target: { url: string; sharingUrl: string; token: string },
  gate: GateRecord | null,
  options?: { sameWindow?: boolean }
): Promise<PlServerCompanyOpenResult> {
  const useNewTab = !options?.sameWindow && shouldOpenPlServerCompanyInNewTab();

  try {
    const gateBridge = (window as Window & { plElectronGate?: PlElectronGateBridge }).plElectronGate;
    gateBridge?.setRemoteAuth?.(target.sharingUrl, target.token);
  } catch {
    /* ignore */
  }

  if (useNewTab) {
    if (isElectronDesktopApp()) {
      try {
        const tabBridge = (window as Window & { plElectronTabBridge?: PlElectronTabBridge }).plElectronTabBridge;
        plGateTrace("open_connect_target", { url: target.url, mode: "electron_new_tab" });
        const res = await tabBridge?.openUrlInNewTab?.(target.url);
        if (res?.ok !== false) return "opened_new_tab";
      } catch {
        /* fall through to window.open */
      }
    }
    // APK/iOS: kabhi external browser mat kholo — same WebView navigate.
    if (isEmbeddedMobileShell()) {
      persistDevClientAccessToken(target.token);
      if (gate) {
        persistGateSelection(gate);
        applyActiveGateRuntime({ ...gate, accessToken: "" });
      }
      markPlRemoteServerClientMode();
      registerElectronRemoteGateOrigin(target.sharingUrl);
      window.location.href = target.url;
      return "navigated_same_window";
    }
    const opened = window.open(target.url, "_blank", "noopener,noreferrer");
    if (opened) return "opened_new_tab";
    return "popup_blocked";
  }

  persistDevClientAccessToken(target.token);
  if (gate) {
    persistGateSelection(gate);
    applyActiveGateRuntime({ ...gate, accessToken: "" });
  }
  markPlRemoteServerClientMode();
  registerElectronRemoteGateOrigin(target.sharingUrl);
  window.location.href = target.url;
  return "navigated_same_window";
}

/** Gate → Connect & open (web/EXE: nayi tab; mobile: same UI navigate). */
export async function openPlServerGateConnectUrl(
  gate: GateRecord,
  companyId?: string
): Promise<PlServerCompanyOpenResult> {
  if (typeof window === "undefined") return "skipped";
  if (gate.type !== "local_server" || !gate.serverUrl) return "skipped";
  if (shouldSkipPlServerSelectRedirect()) return "skipped";

  if (isAppUiOrigin() && !isPlRemoteServerClientMode()) {
    const { activateLocalServerGateOnWebClient } = await import("@/lib/gates/gateRuntime");
    const activated = await activateLocalServerGateOnWebClient(gate);
    if (!activated.ok) return "skipped";
    return "skipped";
  }

  const target = await buildPlServerConnectUrl(gate, companyId);
  if (!target) return "skipped";

  if (isSameBrowserOrigin(target.sharingUrl) && !shouldOpenPlServerCompanyInNewTab()) {
    persistGateSelection(gate);
    applyActiveGateRuntime({ ...gate, accessToken: "" });
    if (!isPlRemoteServerClientMode()) markPlRemoteServerClientMode();
    return "skipped";
  }

  return openPlServerConnectTarget(target, gate);
}

/**
 * Company picker / Gate page: PL server company → sharing URL (3001).
 * Web/EXE: nayi tab; mobile: same WebView.
 */
export async function tryNavigateToPlServerCompanyOnSelect(
  company: Company,
  options?: { gate?: GateRecord | null; force?: boolean }
): Promise<PlServerCompanyOpenResult> {
  if (typeof window === "undefined") return "skipped";
  const force = options?.force === true;
  if (!force && !isServerGateCompany(company)) return "skipped";
  if (isAppUiOrigin()) rememberAppHubOrigin();
  if (shouldSkipPlServerSelectRedirect()) return "skipped";

  const gate = resolveGateForServerCompany(company, options?.gate);
  if (!gate?.serverUrl) return "skipped";

  if (shouldUnlockPlServerCompanyInPlaceOnHub(company, gate)) {
    if (!isPlHubServerClientMode()) {
      const { activateLocalServerGateOnWebClient } = await import("@/lib/gates/gateRuntime");
      const activated = await activateLocalServerGateOnWebClient(gate);
      if (!activated.ok) return "skipped";
    } else {
      persistGateSelection(gate);
      applyActiveGateRuntime({ ...gate, accessToken: "" });
      registerElectronRemoteGateOrigin(gate.serverUrl);
    }
    plGateTrace("pl_server_select_in_place_hub", { companyId: company.id, gateId: gate.id });
    return "skipped";
  }

  const target = await buildPlServerConnectUrl(gate, company.id);
  if (!target) return "skipped";

  if (isSameBrowserOrigin(target.sharingUrl) && !shouldOpenPlServerCompanyInNewTab()) {
    persistGateSelection(gate);
    applyActiveGateRuntime({ ...gate, accessToken: "" });
    if (!isPlRemoteServerClientMode()) markPlRemoteServerClientMode();
    return "skipped";
  }

  if (shouldOpenPlServerCompanyInNewTab()) {
    return openPlServerConnectTarget(target, gate);
  }

  return openPlServerConnectTarget(target, gate, { sameWindow: true });
}

/** Gate page stub row (sirf id) — gate se server URL resolve karke open. */
export async function openPlServerCompanyFromGateList(
  companyId: string,
  gate: GateRecord
): Promise<PlServerCompanyOpenResult> {
  if (!companyId.trim() || gate.type !== "local_server") return "skipped";
  const stub = {
    id: companyId.trim(),
    name: companyId.trim(),
    ownerId: "",
    storageOption: "local" as const,
    plServerShared: true,
    plServerGateId: gate.id,
    plServerGateServerUrl: gate.serverUrl,
    isOwned: false,
  } as Company;
  return tryNavigateToPlServerCompanyOnSelect(stub, { gate, force: true });
}

async function buildPlServerGatePageTarget(
  gate: GateRecord
): Promise<{ url: string; sharingUrl: string; token: string } | null> {
  const serverUrlRaw = normalizeServerUrl(gate.serverUrl || "");
  if (!serverUrlRaw) return null;
  // Open gate = instant tab; company list loads on sharing URL via /__pl_access_context (not here).
  const sharingUrl = serverUrlRaw;
  const transportUrl = serverUrlRaw;
  const token = resolveLocalServerGateAccessToken(gate);
  let url = appendPlGateLandingParams(`${transportUrl.replace(/\/$/, "")}/gate?pl_remote_client=1`, {
    id: gate.id,
    label: gate.label,
    serverUrl: sharingUrl,
  });
  const firebaseHandoff = await fetchPlFirebaseHandoffCustomToken();
  if (firebaseHandoff) {
    url = appendPlFirebaseHandoffToConnectUrl(url, firebaseHandoff);
  }
  return { url, sharingUrl: transportUrl, token };
}

/** Hub Gate page → relay activate (same tab); legacy sharing URL tab sirf non-hub. */
export async function openPlServerGatePage(gate: GateRecord): Promise<PlServerCompanyOpenResult> {
  if (typeof window === "undefined") return "skipped";
  if (gate.type !== "local_server" || !gate.serverUrl) return "skipped";
  rememberAppHubOrigin();
  if (isAppUiOrigin() && !isPlRemoteServerClientMode()) {
    const { activateLocalServerGateOnWebClient } = await import("@/lib/gates/gateRuntime");
    const activated = await activateLocalServerGateOnWebClient(gate);
    plGateTrace("open_gate_in_place", { gateId: gate.id, ok: activated.ok, message: activated.message ?? null });
    return "skipped";
  }
  const target = await buildPlServerGatePageTarget(gate);
  if (!target) return "skipped";
  return openPlServerConnectTarget(target, gate);
}

/** Server URL par local / online company → app hub (`:3000`) wapas. */
export function tryNavigateBackToAppHubForLocalOnlineCompany(companyId?: string): boolean {
  if (typeof window === "undefined") return false;
  if (isAppUiOrigin()) return false;
  if (isPlSharingServerPortOrigin() && !isPlRemoteServerClientMode()) return false;

  const hub = resolveAppHubOrigin();
  if (!hub) return false;
  try {
    if (new URL(hub).origin === window.location.origin) return false;
  } catch {
    return false;
  }

  const id = String(companyId || "").trim();
  const path = id ? `/company?pl_company=${encodeURIComponent(id)}` : "/company";
  window.location.href = `${hub.replace(/\/$/, "")}${path}`;
  return true;
}

export async function openPlServerGateConnectFromRecord(gate: GateRecord): Promise<PlServerCompanyOpenResult> {
  const resolvedGate = gate.type === "local_server" && gate.serverUrl ? gate : gateFromServerUrlOnly(gate.serverUrl || "");
  if (!resolvedGate) return "skipped";
  return openPlServerGateConnectUrl(resolvedGate);
}
