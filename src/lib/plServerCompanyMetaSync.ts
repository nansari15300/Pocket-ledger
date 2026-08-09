"use client";

import type { PermissionConfig } from "@/hooks/usePermissions";
import { gateHttpGet, gateHttpPost } from "@/lib/gates/gateServerFetch";
import { getActiveGate, normalizeServerUrl } from "@/lib/gates/gateStore";
import { getPlServerSharedCompanies } from "@/lib/plServerAccessContext";
import { plServerClientLocalCompanyRow } from "@/lib/plServerClientCompanyDelta";
import { resolvePlServerDeltaTransport } from "@/lib/plServerClientDeltaSync";
import { BUMP_LOCAL_COMPANY_REGISTRY_EVENT } from "@/lib/applyStripePlanToLocalCompany";
import { plGateTrace } from "@/lib/plGateTrace";
import { normalizeLocalCompanyAppRole } from "@/lib/localCompanyAppRoles";

export const PL_SERVER_COMPANY_META_COLLECTION = "company_meta";
export const PL_SERVER_COMPANY_META_UPDATED_EVENT = "pl-server-company-meta-updated";

/** Host par shareable local company — permissions Firebase nahi, SQLite + PL server delta se staff tak. */
export async function shouldPersistPermissionConfigViaPlServerHost(
  companyId: string,
  companyRow?: { storageOption?: string; syncedFromCloud?: boolean; plServerShared?: boolean; syncPolicy?: string; authoritativeCompanyId?: string } | null
): Promise<boolean> {
  const id = String(companyId || "").trim();
  if (!id) return false;
  const { companyUsesDeviceOrPlPermissionConfig } = await import("@/lib/permissionConfigSource");
  if (companyRow && companyUsesDeviceOrPlPermissionConfig(companyRow)) return true;
  try {
    const { getLocalCompanyById } = await import("@/lib/localCompanyStore");
    const { normalizeLocalCompanyRowForHost } = await import("@/lib/listShareableLocalCompaniesForHost");
    const row = await getLocalCompanyById(id, { includeDeleted: true });
    if (!row) return false;
    return companyUsesDeviceOrPlPermissionConfig(normalizeLocalCompanyRowForHost(row));
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
  const { getLocalCompanyById } = await import("@/lib/localCompanyStore");
  const doc = await getLocalCompanyById(id, { includeDeleted: true });
  if (!doc) return false;

  // Live snapshot: token client slug ya host canonical id pe ho sakta hai.
  const authCompanyIds = new Set<string>([id]);
  const hostAlias = String(
    (doc as { plServerHostCompanyId?: string }).plServerHostCompanyId ||
      (doc as { authoritativeCompanyId?: string }).authoritativeCompanyId ||
      ""
  ).trim();
  if (hostAlias) authCompanyIds.add(hostAlias);
  try {
    const { resolvePlServerHostCompanyId } = await import("@/lib/plServerHostCompanyId");
    const host = String((await resolvePlServerHostCompanyId(id)) || "").trim();
    if (host) authCompanyIds.add(host);
  } catch {
    /* optional */
  }

  let sessionCompanyId = "";
  let token: string | null = null;
  let sessionUser: ReturnType<typeof getLocalAuthUser> = null;
  for (const cid of authCompanyIds) {
    const t = getLocalAuthToken(cid);
    const u = t ? getLocalAuthUser(cid) : null;
    if (t && u?.username) {
      sessionCompanyId = cid;
      token = t;
      sessionUser = u;
      break;
    }
  }
  if (!token || !sessionUser?.username || !sessionCompanyId) return false;

  const { parseLocalCompanyUserRows, findLocalCompanyUserRowForAppUser } = await import(
    "@/lib/localCompanyUsers"
  );
  const rows = parseLocalCompanyUserRows((doc as { localCompanyUsers?: unknown }).localCompanyUsers);
  const un = sessionUser.username.trim().toLowerCase();
  const unLocal = un.includes("@") ? un.split("@")[0]!.trim() : un;
  const match =
    findLocalCompanyUserRowForAppUser(rows, sessionUser.id, un.includes("@") ? un : null) ||
    rows.find((row) => row.username.trim().toLowerCase() === un) ||
    rows.find((row) => row.id === sessionUser.id) ||
    (unLocal
      ? rows.find((row) => {
          const ru = row.username.trim().toLowerCase();
          if (ru === unLocal) return true;
          const share = String(row.shareEmail || "")
            .trim()
            .toLowerCase();
          if (share === un || (share.includes("@") && share.split("@")[0] === unLocal)) return true;
          return false;
        })
      : undefined) ||
    null;
  if (!match) {
    plGateTrace("staff_session_role_sync_no_match", {
      companyId: id,
      sessionUsername: un,
      sessionId: sessionUser.id,
      userCount: rows.length,
      usernames: rows.slice(0, 8).map((r) => r.username),
    });
    return false;
  }
  const nextRole = normalizeLocalCompanyAppRole(match.role || sessionUser.role || "viewer");
  const nextUser = {
    id: match.id || sessionUser.id,
    username: match.username || sessionUser.username,
    displayName: match.displayName || sessionUser.displayName,
    role: nextRole,
  };
  const changed =
    nextRole !== normalizeLocalCompanyAppRole(sessionUser.role) ||
    String(nextUser.id || "") !== String(sessionUser.id || "") ||
    String(nextUser.displayName || "").trim() !== String(sessionUser.displayName || "").trim() ||
    String(nextUser.username || "").trim().toLowerCase() !== un;

  // Unchanged pe LOCAL_AUTH / setCompany storm mat chalao — role really badle tabhi write.
  if (!changed) return false;
  for (const cid of authCompanyIds) {
    const t = getLocalAuthToken(cid) || (cid === sessionCompanyId ? token : null);
    if (!t) continue;
    setLocalAuthToken(cid, t, nextUser);
  }
  plGateTrace("staff_session_role_synced_from_host", {
    companyId: id,
    role: nextRole,
    username: match.username,
  });
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
  try {
    const { flushPendingBrowserDbSave } = await import("@/lib/localSqlite");
    await flushPendingBrowserDbSave();
  } catch {
    /* non-fatal */
  }
  const sessionChanged = await applyPlServerStaffSessionFromCompanyMeta(id);
  bumpLocalCompanyRegistry();
  if (typeof window !== "undefined") {
    const users =
      patch.localCompanyUsers !== undefined
        ? patch.localCompanyUsers
        : (await getLocalCompanyById(id, { includeDeleted: true }) as { localCompanyUsers?: unknown } | null)
            ?.localCompanyUsers;
    window.dispatchEvent(
      new CustomEvent(PL_SERVER_COMPANY_META_UPDATED_EVENT, {
        detail: { companyId: id, localCompanyUsers: users },
      })
    );
  }
  plGateTrace("staff_company_meta_patch_applied", {
    companyId: id,
    hasPermissionConfig: Boolean(patch.permissionConfig),
    hasLocalCompanyUsers: Array.isArray(patch.localCompanyUsers),
    sessionChanged,
  });
  try {
    const { logPlPerm, summarizePermissionDateLimits } = await import("@/lib/permissionConfigSource");
    logPlPerm("client-patch", {
      companyId: id,
      hasPermissionConfig: Boolean(patch.permissionConfig),
      dateLimits: summarizePermissionDateLimits(patch.permissionConfig as { dateLimits?: Record<string, { entryDays?: number; editDays?: number; deleteDays?: number }> } | undefined),
    });
  } catch {
    /* ignore */
  }
  return true;
}

/** Inflight + cooldown — click storm pe HTTP/SQLite flood → EXE crash (40–60s). */
const META_PULL_COOLDOWN_MS = 20_000;
const META_NOOP_LOG_COOLDOWN_MS = 30_000;
const metaPullInflight = new Map<string, Promise<boolean>>();
const metaPullLastOkAt = new Map<string, number>();
const metaNoopLogLastAt = new Map<string, number>();

async function logMetaPullNoopOnce(companyId: string, extra?: Record<string, unknown>): Promise<void> {
  const now = Date.now();
  const last = metaNoopLogLastAt.get(companyId) || 0;
  if (now - last < META_NOOP_LOG_COOLDOWN_MS) return;
  metaNoopLogLastAt.set(companyId, now);
  try {
    const { plNavLog } = await import("@/lib/plServerLivePullDevLog");
    plNavLog("meta_pull_noop", { companyId, skippedUiBump: true, ...extra });
  } catch {
    /* optional */
  }
}

/** Staff / hub client: host se company meta (permissions + login users) pull + apply. */
export async function pullPlServerCompanyMetaFromHost(
  companyId: string,
  options?: { force?: boolean }
): Promise<boolean> {
  const id = String(companyId || "").trim();
  if (!id) return false;
  const force = options?.force === true;

  const inflight = metaPullInflight.get(id);
  if (inflight) return inflight;

  const lastOk = metaPullLastOkAt.get(id) || 0;
  if (!force && Date.now() - lastOk < META_PULL_COOLDOWN_MS) {
    await logMetaPullNoopOnce(id, { reason: "cooldown", cooldownMs: META_PULL_COOLDOWN_MS });
    return true;
  }

  const run = (async (): Promise<boolean> => {
    try {
      const bundle = await fetchCompanyMetaBundle(id);
      const fromHost = bundle?.company;
      if (!fromHost || typeof fromHost !== "object") return false;

      const shared = getPlServerSharedCompanies().find((row) => String(row.id || "").trim() === id);
      const { getLocalCompanyById, upsertLocalCompany } = await import("@/lib/localCompanyStore");
      const existing = await getLocalCompanyById(id, { includeDeleted: true });
      const permissionConfig = fromHost.permissionConfig as PermissionConfig | undefined;
      const localCompanyUsers = fromHost.localCompanyUsers;
      const prevPermJson = JSON.stringify(
        (existing as { permissionConfig?: PermissionConfig } | null)?.permissionConfig ?? null
      );
      const nextPermJson = JSON.stringify(permissionConfig ?? null);
      const prevUsersJson = JSON.stringify(
        (existing as { localCompanyUsers?: unknown } | null)?.localCompanyUsers ?? null
      );
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

      if (metaChanged) {
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
      }
      const sessionChanged = await applyPlServerStaffSessionFromCompanyMeta(id);
      metaPullLastOkAt.set(id, Date.now());

      if (!metaChanged && !sessionChanged) {
        plGateTrace("staff_company_meta_pull_done", {
          companyId: id,
          hasPermissionConfig: Boolean(permissionConfig),
          userCount: Array.isArray(localCompanyUsers) ? localCompanyUsers.length : 0,
          metaChanged: false,
          sessionChanged: false,
          skippedUiBump: true,
        });
        await logMetaPullNoopOnce(id, { reason: "unchanged" });
        return true;
      }
      bumpLocalCompanyRegistry();
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent(PL_SERVER_COMPANY_META_UPDATED_EVENT, {
            detail: {
              companyId: id,
              localCompanyUsers: Array.isArray(localCompanyUsers)
                ? localCompanyUsers
                : (existing as { localCompanyUsers?: unknown } | null)?.localCompanyUsers,
            },
          })
        );
      }
      plGateTrace("staff_company_meta_pull_done", {
        companyId: id,
        hasPermissionConfig: Boolean(permissionConfig),
        userCount: Array.isArray(localCompanyUsers) ? localCompanyUsers.length : 0,
        metaChanged,
        sessionChanged,
      });
      try {
        const { plNavLog } = await import("@/lib/plServerLivePullDevLog");
        plNavLog("meta_pull_applied", { companyId: id, metaChanged, sessionChanged });
      } catch {
        /* optional */
      }
      try {
        const { logPlPerm, summarizePermissionDateLimits } = await import("@/lib/permissionConfigSource");
        logPlPerm("client-pull", {
          companyId: id,
          metaChanged,
          hasPermissionConfig: Boolean(permissionConfig),
          dateLimits: summarizePermissionDateLimits(permissionConfig),
        });
      } catch {
        /* ignore */
      }
      return true;
    } finally {
      if (metaPullInflight.get(id) === run) metaPullInflight.delete(id);
    }
  })();

  metaPullInflight.set(id, run);
  return run;
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
  try {
    const { plRoleLog, plRoleUsersSummary } = await import("@/lib/plRoleChangeLog");
    const users = Array.isArray(patch?.localCompanyUsers)
      ? (patch!.localCompanyUsers as Array<{ id?: string; username?: string; role?: string }>)
      : [];
    plRoleLog("notify_host_meta", {
      companyId,
      hasPatch: Boolean(patch),
      userCount: users.length,
      users: plRoleUsersSummary(users),
    });
  } catch {
    /* ignore */
  }
  await publishPlServerHostCompanyMetaChange(companyId, patch);
}
