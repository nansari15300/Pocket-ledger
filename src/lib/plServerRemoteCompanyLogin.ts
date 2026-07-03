"use client";

import type { GateRecord } from "@/lib/gates/gateTypes";
import { getActiveGate, normalizeServerUrl } from "@/lib/gates/gateStore";
import { resolveLocalServerGateAccessToken } from "@/lib/gates/gateRuntime";
import { gateHttpPost } from "@/lib/gates/gateServerFetch";
import { isPlRemoteServerClientMode } from "@/lib/plRemoteServerClient";
import {
  persistDevClientAccessToken,
  readDevClientAccessToken,
  readPlServerGatePreviewContext,
} from "@/lib/plServerAccessContext";
import { getLocalCompanyById } from "@/lib/localCompanyStore";
import { isServerGateCompany } from "@/lib/companyStorageKind";

export type PlServerLoginResult = {
  token: string;
  user: { id: string; username: string; displayName?: string; role?: string };
};

export type PlServerRemoteLoginOptions = {
  /** Gate page se explicit server gate — active gate galat ho to bhi sahi URL/token. */
  gate?: GateRecord | null;
};

function resolveRemoteLoginContext(options?: PlServerRemoteLoginOptions): {
  baseUrl: string;
  accessToken: string;
} {
  const gate = options?.gate ?? getActiveGate();
  if (typeof window === "undefined") return { baseUrl: "", accessToken: "" };
  if (isPlRemoteServerClientMode()) {
    return { baseUrl: window.location.origin, accessToken: readDevClientAccessToken() };
  }
  if (gate.type === "local_server" && gate.serverUrl) {
    const accessToken = resolveLocalServerGateAccessToken(gate);
    if (accessToken) persistDevClientAccessToken(accessToken);
    return {
      baseUrl: normalizeServerUrl(gate.serverUrl),
      accessToken,
    };
  }
  return { baseUrl: "", accessToken: readDevClientAccessToken() };
}

function companyAllowedOnServerGate(companyId: string, gate: GateRecord): boolean {
  const id = String(companyId || "").trim();
  if (!id || gate.type !== "local_server") return false;
  const preview = readPlServerGatePreviewContext(gate.id);
  if (preview.companies.some((row) => String(row.id || "").trim() === id)) return true;
  if (preview.allowedCompanyIds === null) return true;
  return (preview.allowedCompanyIds || []).some((x) => String(x || "").trim() === id);
}

export function isCompanyAllowedOnActiveServerGate(companyId: string, gate?: GateRecord): boolean {
  return companyAllowedOnServerGate(companyId, gate ?? getActiveGate());
}

/** Bundled client + local_server gate: company login server PC SQLite par verify hota hai. */
export async function shouldUsePlServerRemoteCompanyLogin(
  companyId: string,
  options?: PlServerRemoteLoginOptions
): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (isPlRemoteServerClientMode()) return false;
  const gate = options?.gate ?? getActiveGate();
  if (gate.type !== "local_server" || !gate.serverUrl) return false;
  if (companyAllowedOnServerGate(companyId, gate)) return true;
  try {
    const doc = await getLocalCompanyById(companyId, { includeDeleted: true });
    if (doc && isServerGateCompany(doc)) return true;
  } catch {
    /* fall through */
  }
  return false;
}

export async function plServerRemoteCompanyLogin(
  companyId: string,
  username: string,
  password: string,
  options?: PlServerRemoteLoginOptions
): Promise<PlServerLoginResult> {
  const { baseUrl, accessToken } = resolveRemoteLoginContext(options);
  if (!baseUrl || !accessToken) {
    throw new Error("Server gate is not connected. Open Gate, tap Test, then try again.");
  }
  const url = `${baseUrl.replace(/\/$/, "")}/__pl_company_login`;
  const { status, body } = await gateHttpPost(url, accessToken, {
    companyId: String(companyId || "").trim(),
    username: String(username || "").trim(),
    password: String(password || "").trim(),
  });
  let payload: { ok?: boolean; error?: string; token?: string; user?: PlServerLoginResult["user"] } = {};
  try {
    payload = JSON.parse(body) as typeof payload;
  } catch {
    payload = {};
  }
  if (status === 403) {
    throw new Error("Invalid access token — edit the gate and paste the token from the server PC.");
  }
  if (status === 503 && payload.error === "server_login_unavailable") {
    throw new Error("Server login is not ready. Keep Pocket Ledger open on the server PC, then try again.");
  }
  if (!status || status >= 500) {
    throw new Error(`Cannot reach server (${status || "network"}). Check IP, port, and Wi‑Fi.`);
  }
  if (!status || status >= 400 || payload.ok !== true || !payload.token || !payload.user) {
    throw new Error(String(payload.error || "Invalid username or password"));
  }
  return { token: payload.token, user: payload.user };
}

/** Active local_server gate par company selection — mirror/list race par clear mat karo. */
export async function shouldRetainServerGateCompanySelection(companyId: string): Promise<boolean> {
  const id = String(companyId || "").trim();
  if (!id) return false;
  const gate = getActiveGate();
  if (gate.type !== "local_server" || !gate.serverUrl) return false;
  if (companyAllowedOnServerGate(companyId, gate)) return true;
  try {
    const doc = await getLocalCompanyById(id, { includeDeleted: true });
    return Boolean(doc && isServerGateCompany(doc));
  } catch {
    return false;
  }
}
