"use client";

import type { GateRecord } from "@/lib/gates/gateTypes";
import { getActiveGate, normalizeServerUrl } from "@/lib/gates/gateStore";
import { gateHttpPost, gateHttpGet } from "@/lib/gates/gateServerFetch";
import { isPlRemoteServerClientMode } from "@/lib/plRemoteServerClient";
import {
  readPlServerGatePreviewContext,
  plServerShareListAuthoritativeEmpty,
  getPlServerSharedCompanies,
} from "@/lib/plServerAccessContext";
import { getLocalCompanyById } from "@/lib/localCompanyStore";
import { isServerGateCompany } from "@/lib/companyStorageKind";
import { matchPlServerSharedCompanyForLocalId } from "@/lib/plServerHostCompanyId";
import type { PlServerCompanyLoginMeta } from "@/lib/plServerCompanyLoginMeta";
import { loginMetaFromSharedSummary } from "@/lib/plServerCompanyLoginMeta";
import type { PlServerSharedCompanySummary } from "@/lib/localServerShareableCompanies";

export type PlServerLoginResult = {
  token: string;
  user: { id: string; username: string; displayName?: string; role?: string };
};

export type PlServerRemoteLoginOptions = {
  /** Gate page se explicit server gate — active gate galat ho to bhi sahi URL. */
  gate?: GateRecord | null;
};

function resolveRemoteLoginContext(options?: PlServerRemoteLoginOptions): {
  baseUrl: string;
  accessToken: string;
} {
  const gate = options?.gate ?? getActiveGate();
  if (typeof window === "undefined") return { baseUrl: "", accessToken: "" };
  if (isPlRemoteServerClientMode()) {
    return { baseUrl: window.location.origin, accessToken: "" };
  }
  if (gate.type === "local_server" && gate.serverUrl) {
    return {
      baseUrl: normalizeServerUrl(gate.serverUrl),
      accessToken: "",
    };
  }
  return { baseUrl: "", accessToken: "" };
}

/**
 * Staff local company id (`82-83_4de81f37`) vs host share id (`82-83_6e86788a`) —
 * exact match fail → authoritative push + attachment upload silently disabled.
 */
function companyAllowedOnServerGate(companyId: string, gate: GateRecord): boolean {
  const id = String(companyId || "").trim();
  if (!id || gate.type !== "local_server") return false;
  const preview = readPlServerGatePreviewContext(gate.id);
  if (preview.companies.length === 0 && plServerShareListAuthoritativeEmpty(gate.id)) {
    const sessionShared = getPlServerSharedCompanies();
    if (sessionShared.some((row) => String(row.id || "").trim() === id)) return true;
    if (matchPlServerSharedCompanyForLocalId(id, sessionShared)) return true;
    return false;
  }
  if (preview.companies.some((row) => String(row.id || "").trim() === id)) return true;
  if (preview.companies.length > 0 && matchPlServerSharedCompanyForLocalId(id, preview.companies)) {
    return true;
  }
  const allowed = preview.allowedCompanyIds;
  if (Array.isArray(allowed) && allowed.length > 0) {
    const normalized = allowed.map((x) => String(x || "").trim()).filter(Boolean);
    if (normalized.some((x) => x === id)) return true;
    const asRows: PlServerSharedCompanySummary[] = normalized.map((aid) => ({
      id: aid,
      name: "",
      storageOption: "local" as const,
    }));
    if (matchPlServerSharedCompanyForLocalId(id, asRows)) return true;
  }
  return false;
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
  if (!baseUrl) {
    throw new Error("Server gate is not connected. Open Gate, tap Test, then try again.");
  }
  const { resolvePlServerHostCompanyId } = await import("@/lib/plServerHostCompanyId");
  const hostCompanyId = (await resolvePlServerHostCompanyId(companyId)) || String(companyId || "").trim();
  const url = `${baseUrl.replace(/\/$/, "")}/__pl_company_login`;
  const { status, body } = await gateHttpPost(url, accessToken || "", {
    companyId: hostCompanyId,
    username: String(username || "").trim(),
    password: String(password || "").trim(),
  }, { timeoutMs: 90_000 });
  let payload: { ok?: boolean; error?: string; token?: string; user?: PlServerLoginResult["user"] } = {};
  try {
    payload = JSON.parse(body) as typeof payload;
  } catch {
    payload = {};
  }
  if (status === 403) {
    throw new Error("Server denied this gate connection. Re-test the server gate and try again.");
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

/** Gate company row ya host meta API se — unlock dialog dikhana hai ya nahi. */
export async function fetchPlServerCompanyLoginMeta(
  companyId: string,
  options?: PlServerRemoteLoginOptions & { appEmail?: string | null; appUid?: string | null }
): Promise<PlServerCompanyLoginMeta> {
  const id = String(companyId || "").trim();
  const gate = options?.gate ?? getActiveGate();
  const preview = readPlServerGatePreviewContext(gate.type === "local_server" ? gate.id : null);
  const fromPreview =
    preview.companies.find((r) => String(r.id || "").trim() === id) ||
    matchPlServerSharedCompanyForLocalId(id, preview.companies);
  const summaryMeta = fromPreview ? loginMetaFromSharedSummary(fromPreview) : null;
  if (summaryMeta) return summaryMeta;

  const { baseUrl } = resolveRemoteLoginContext(options);
  const email = String(options?.appEmail || "").trim();
  const emailHint = email.includes("@") ? email.split("@")[0] || null : null;
  if (!baseUrl || !id) {
    return { requiresLogin: true, usernameHint: emailHint };
  }
  const { resolvePlServerHostCompanyId } = await import("@/lib/plServerHostCompanyId");
  const hostCompanyId = (await resolvePlServerHostCompanyId(id)) || id;
  const params = new URLSearchParams({ companyId: hostCompanyId });
  if (email) params.set("appEmail", email);
  const url = `${baseUrl.replace(/\/$/, "")}/__pl_company_login_meta?${params.toString()}`;
  try {
    const { status, body } = await gateHttpGet(url, "");
    if (status >= 200 && status < 300 && body) {
      const data = JSON.parse(body) as PlServerCompanyLoginMeta;
      return {
        requiresLogin: data.requiresLogin === true,
        usernameHint: data.usernameHint?.trim() ? String(data.usernameHint).trim() : emailHint,
      };
    }
  } catch {
    /* fall through */
  }
  return { requiresLogin: true, usernameHint: emailHint };
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
