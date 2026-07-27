"use client";

import type { PermissionConfig } from "@/hooks/usePermissions";
import { gateHttpGet, gateHttpPost } from "@/lib/gates/gateServerFetch";
import { getActiveGate, normalizeServerUrl } from "@/lib/gates/gateStore";
import { getPlServerSharedCompanies } from "@/lib/plServerAccessContext";
import { plServerClientLocalCompanyRow } from "@/lib/plServerClientCompanyDelta";
import { resolvePlServerDeltaTransport } from "@/lib/plServerClientDeltaSync";
import { BUMP_LOCAL_COMPANY_REGISTRY_EVENT } from "@/lib/applyStripePlanToLocalCompany";
import { parseLocalCompanyUserRows } from "@/lib/localCompanyUsers";
import { plGateTrace } from "@/lib/plGateTrace";

export const PL_SERVER_COMPANY_META_COLLECTION = "company_meta";
export const PL_SERVER_COMPANY_META_UPDATED_EVENT = "pl-server-company-meta-updated";

/** Host par shareable local company — permissions Firebase nahi, SQLite + PL server delta se staff tak. */
export async function shouldPersistPermissionConfigViaPlServerHost(
  companyId: string,
  companyRow?: { storageOption?: string; syncedFromCloud?: boolean } | null
): Promise<boolean> {
  const id = String(companyId || "").trim();
  if (!id) return false;
  const { isOfflineCompanyStorage } = await import("@/lib/companyUnlockGate");
  if (companyRow && isOfflineCompanyStorage(companyRow)) return true;
  try {
    const { getLocalCompanyById } = await import("@/lib/localCompanyStore");
    const { normalizeLocalCompanyRowForHost } = await import("@/lib/listShareableLocalCompaniesForHost");
    const { isLocalServerShareableCompany } = await import("@/lib/localServerShareableCompanies");
    const row = await getLocalCompanyById(id, { includeDeleted: true });
    if (!row) return false;
    return isLocalServerShareableCompany(normalizeLocalCompanyRowForHost(row));
  } catch {
    return false;
  }
}

type CompanyMetaBundle = {
  company?: Record<string, unknown> | null;
};

function resolveMetaFetchBaseUrl(companyId: string): string {
  if (typeof window === "undefined") return "";
  const transport = resolvePlServerDeltaTransport(companyId);
  if (transport?.baseUrl) return transport.baseUrl.replace(/\/$/, "");
  const gate = getActiveGate();
  if (gate.type === "local_server" && gate.serverUrl) {
    return normalizeServerUrl(gate.serverUrl).replace(/\/$/, "");
  }
  return "";
}

async function fetchCompanyMetaBundle(companyId: string): Promise<CompanyMetaBundle | null> {
  const baseUrl = resolveMetaFetchBaseUrl(companyId);
  if (!baseUrl) return null;
  // Ledger delta jaisa: staff local id ≠ host id ho to host canonical id se fetch.
  const { resolvePlServerHostCompanyId } = await import("@/lib/plServerHostCompanyId");
  const hostCompanyId = (await resolvePlServerHostCompanyId(companyId)) || String(companyId || "").trim();
  if (!hostCompanyId) return null;
  const url = `${baseUrl}/__pl_company_delta/${encodeURIComponent(hostCompanyId)}`;
  try {
    const { status, body } = await gateHttpGet(url, "", { timeoutMs: 25_000 });
    if (!status || status >= 400) return null;
    return JSON.parse(body) as CompanyMetaBundle;
  } catch {
    return null;
  }
}

/** Host PC: sharing users / permissionConfig save ke baad staff clients ko turant bump. */
export async function publishPlServerHostCompanyMetaChange(
  companyId: string,
  companyPatch?: Record<string, unknown>
): Promise<void> {
  const id = String(companyId || "").trim();
  if (!id || typeof window === "undefined") return;
  try {
    const { isPlServerShareableHostWriter, resolvePlServerHostLoopbackTransport } = await import(
      "@/lib/plServerHostDeltaPublish"
    );
    if (!(await isPlServerShareableHostWriter(id))) return;
    const transport = await resolvePlServerHostLoopbackTransport(id);
    if (!transport?.baseUrl) return;
    const url = `${transport.baseUrl.replace(/\/$/, "")}/__pl_company_meta_bump`;
    await gateHttpPost(url, transport.accessToken || "", {
      companyId: id,
      ...(companyPatch ? { company: companyPatch } : {}),
    });
    plGateTrace("host_company_meta_bump_sent", { companyId: id });
  } catch (e) {
    plGateTrace("host_company_meta_bump_failed", {
      companyId: id,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

/** Staff session role/displayName ← host `localCompanyUsers` (Manage Sharing save). */
export async function applyPlServerStaffSessionFromCompanyMeta(companyId: string): Promise<boolean> {
  const id = String(companyId || "").trim();
  if (!id || typeof window === "undefined") return false;
  const { getLocalAuthToken, getLocalAuthUser, setLocalAuthToken } = await import("@/lib/localApiClient");
  const token = getLocalAuthToken(id);
  if (!token) return false;
  const sessionUser = getLocalAuthUser(id);
  if (!sessionUser?.username) return false;
  const { getLocalCompanyById } = await import("@/lib/localCompanyStore");
  const doc = await getLocalCompanyById(id, { includeDeleted: true });
  if (!doc) return false;
  const rows = parseLocalCompanyUserRows((doc as { localCompanyUsers?: unknown }).localCompanyUsers);
  const un = sessionUser.username.trim().toLowerCase();
  const match =
    rows.find((row) => row.username.trim().toLowerCase() === un) ||
    rows.find((row) => row.id === sessionUser.id);
  if (!match) return false;
  const nextRole = String(match.role || sessionUser.role || "viewer").trim().toLowerCase();
  const changed =
    nextRole !== String(sessionUser.role || "").trim().toLowerCase() ||
    String(match.displayName || "").trim() !== String(sessionUser.displayName || "").trim();
  if (!changed) return false;
  setLocalAuthToken(id, token, {
    id: match.id || sessionUser.id,
    username: match.username || sessionUser.username,
    displayName: match.displayName || sessionUser.displayName,
    role: nextRole,
  });
  plGateTrace("staff_session_role_synced_from_host", { companyId: id, role: nextRole });
  return true;
}

function bumpLocalCompanyRegistry(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(BUMP_LOCAL_COMPANY_REGISTRY_EVENT));
}

/** SSE company-meta fast lane: merge the exact host patch into client SQLite. */
export async function applyPlServerCompanyMetaPatch(
  companyId: string,
  patch: Record<string, unknown>
): Promise<boolean> {
  const id = String(companyId || "").trim();
  if (!id || !patch || typeof patch !== "object") return false;
  const { getLocalCompanyById, upsertLocalCompany } = await import("@/lib/localCompanyStore");
  const existing = await getLocalCompanyById(id, { includeDeleted: true });
  if (!existing) return false;
  await upsertLocalCompany({
    ...existing,
    ...patch,
    id,
    updatedAt: Date.now(),
  });
  await applyPlServerStaffSessionFromCompanyMeta(id);
  bumpLocalCompanyRegistry();
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(PL_SERVER_COMPANY_META_UPDATED_EVENT, { detail: { companyId: id } })
    );
  }
  plGateTrace("staff_company_meta_patch_applied", {
    companyId: id,
    hasPermissionConfig: Boolean(patch.permissionConfig),
    hasLocalCompanyUsers: Array.isArray(patch.localCompanyUsers),
  });
  return true;
}

/** Staff / hub client: host se company meta (permissions + login users) pull + apply. */
export async function pullPlServerCompanyMetaFromHost(companyId: string): Promise<boolean> {
  const id = String(companyId || "").trim();
  if (!id) return false;
  const bundle = await fetchCompanyMetaBundle(id);
  const fromHost = bundle?.company;
  if (!fromHost || typeof fromHost !== "object") return false;

  const shared = getPlServerSharedCompanies().find((row) => String(row.id || "").trim() === id);
  const { getLocalCompanyById, upsertLocalCompany } = await import("@/lib/localCompanyStore");
  const existing = await getLocalCompanyById(id, { includeDeleted: true });
  const permissionConfig = fromHost.permissionConfig as PermissionConfig | undefined;
  const localCompanyUsers = fromHost.localCompanyUsers;
  const prevPermJson = JSON.stringify((existing as { permissionConfig?: PermissionConfig } | null)?.permissionConfig ?? null);
  const nextPermJson = JSON.stringify(permissionConfig ?? null);
  const prevUsersJson = JSON.stringify((existing as { localCompanyUsers?: unknown } | null)?.localCompanyUsers ?? null);
  const nextUsersJson = JSON.stringify(localCompanyUsers ?? null);
  const metaChanged = prevPermJson !== nextPermJson || prevUsersJson !== nextUsersJson;

  const hostName = String(fromHost.name || "").trim();
  const sharedName = String(shared?.name || "").trim();
  const existingName = String(existing?.name || "").trim();
  const resolvedName =
    (hostName && hostName !== id && hostName !== "Server company" ? hostName : "") ||
    (sharedName && sharedName !== id && sharedName !== "Server company" ? sharedName : "") ||
    (existingName && existingName !== id && existingName !== "Server company" ? existingName : "") ||
    "Server company";

  const mergedRow = plServerClientLocalCompanyRow(
    id,
    resolvedName,
    shared?.ownerEmail ?? existing?.ownerEmail ?? null,
    fromHost
  );
  await upsertLocalCompany({
    ...(existing || mergedRow),
    ...mergedRow,
    id,
    ...(permissionConfig ? { permissionConfig } : {}),
    ...(Array.isArray(localCompanyUsers) ? { localCompanyUsers } : {}),
    updatedAt: Date.now(),
  });
  const sessionChanged = await applyPlServerStaffSessionFromCompanyMeta(id);
  if (metaChanged || sessionChanged) {
    bumpLocalCompanyRegistry();
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(PL_SERVER_COMPANY_META_UPDATED_EVENT, { detail: { companyId: id } })
      );
    }
  }
  plGateTrace("staff_company_meta_pull_done", {
    companyId: id,
    hasPermissionConfig: Boolean(permissionConfig),
    userCount: Array.isArray(localCompanyUsers) ? localCompanyUsers.length : 0,
  });
  return true;
}

/** Host-side save helpers: SQLite/local row likhne ke baad live bump. */
export async function notifyPlServerHostCompanyMetaSaved(
  companyId: string,
  companyPatch?: Record<string, unknown>
): Promise<void> {
  let patch = companyPatch;
  if (!patch) {
    try {
      const { getLocalCompanyById } = await import("@/lib/localCompanyStore");
      const row = await getLocalCompanyById(companyId, { includeDeleted: true });
      if (row) {
        patch = {
          ...((row as { permissionConfig?: unknown }).permissionConfig
            ? { permissionConfig: (row as { permissionConfig?: unknown }).permissionConfig }
            : {}),
          ...(Array.isArray((row as { localCompanyUsers?: unknown }).localCompanyUsers)
            ? { localCompanyUsers: (row as { localCompanyUsers?: unknown }).localCompanyUsers }
            : {}),
        };
      }
    } catch {
      /* signal-only fallback */
    }
  }
  await publishPlServerHostCompanyMetaChange(companyId, patch);
}
