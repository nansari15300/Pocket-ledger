"use client";

import { upsertLocalCompany } from "@/lib/localCompanyStore";
import { isServerGateCompany } from "@/lib/companyStorageKind";
import type { GateRecord } from "@/lib/gates/gateTypes";
import { getActiveGate } from "@/lib/gates/gateStore";
import { getPlServerSharedCompanies, refreshPlServerAccessContext } from "@/lib/plServerAccessContext";
import { isAppUiOrigin } from "@/lib/plGatePageOrigin";
import { isPlHubServerClientMode } from "@/lib/plRemoteServerClient";
import { isPlServerThinStaffClient } from "@/lib/plServerThinStaffClient";
import { isPlServerOfflineMirrorReady } from "@/lib/plServerOfflineMirrorReady";

/** Hub relay: gate activate + access context refresh before staff login / delta pull. */
export async function ensurePlServerHubGateReadyForStaffConnect(
  gate: GateRecord | null | undefined
): Promise<{ ok: boolean; message?: string }> {
  if (typeof window === "undefined") return { ok: true };
  if (!isAppUiOrigin()) return { ok: true };
  const resolvedGate =
    gate?.type === "local_server" && gate.serverUrl
      ? gate
      : getActiveGate().type === "local_server"
        ? getActiveGate()
        : null;
  if (!resolvedGate?.serverUrl) {
    return { ok: false, message: "Server gate not configured." };
  }
  if (!isPlHubServerClientMode() || getActiveGate().id !== resolvedGate.id) {
    const { activateLocalServerGateOnWebClient } = await import("@/lib/gates/gateRuntime");
    const activated = await activateLocalServerGateOnWebClient(resolvedGate);
    if (!activated.ok) return activated;
    return { ok: true };
  }
  if (getPlServerSharedCompanies().length === 0) {
    await refreshPlServerAccessContext({ force: true }).catch(() => null);
  }
  return { ok: true };
}

const staffConnectInflight = new Map<string, Promise<{ ok: boolean; fullPull: boolean }>>();

async function pullLegacyStaffLedger(
  companyId: string,
  syncOptions: { pullFullLedger?: boolean; serverGate?: GateRecord | null },
  timeoutMs: number
): Promise<{ synced: boolean; fullPull: boolean }> {
  const { syncPlServerSharedCompanyByIdLegacy } = await import("@/lib/plServerClientCompanyDelta");
  const { plGateTrace } = await import("@/lib/plGateTrace");
  const load = syncPlServerSharedCompanyByIdLegacy(companyId, syncOptions).catch((e) => {
    plGateTrace("staff_connect_legacy_error", {
      companyId,
      error: e instanceof Error ? e.message : String(e),
    });
    return { synced: false, fullPull: false };
  });
  return Promise.race([
    load,
    new Promise<{ synced: boolean; fullPull: boolean }>((resolve) => {
      setTimeout(() => {
        plGateTrace("staff_connect_timeout", { companyId, timeoutMs });
        resolve({ synced: false, fullPull: false });
      }, timeoutMs);
    }),
  ]);
}

/** Hub thin staff: live pull / display cache may already hold ledger while SQLite mirror is empty. */
async function hubStaffLedgerReady(companyId: string): Promise<boolean> {
  const id = String(companyId || "").trim();
  if (!id) return false;
  if (isPlServerOfflineMirrorReady(id)) return true;
  try {
    const { hydratePlServerDisplayCacheFromIdb, plServerDisplayCacheHasUsableLedger } = await import(
      "@/lib/plServerDisplayCache"
    );
    await hydratePlServerDisplayCacheFromIdb(id).catch(() => undefined);
    if (plServerDisplayCacheHasUsableLedger(id)) return true;
    const { listCompanyDocsFromBrowserDb } = await import("@/lib/localCompanyDocMirror");
    const [vouchers, parties] = await Promise.all([
      listCompanyDocsFromBrowserDb(id, "vouchers", { forBackupMerge: true }),
      listCompanyDocsFromBrowserDb(id, "parties", { forBackupMerge: true }),
    ]);
    return vouchers.length > 0 || parties.length > 0;
  } catch {
    return false;
  }
}

async function hubStaffLedgerSatisfiesPull(companyId: string, pullFull: boolean): Promise<boolean> {
  if (!(await hubStaffLedgerReady(companyId))) return false;
  if (!pullFull) return true;
  return isPlServerOfflineMirrorReady(companyId);
}

const HUB_STAFF_FOCUS_COLLECTIONS = [
  "vouchers",
  "parties",
  "bank_accounts",
  "expense_accounts",
  "taxes",
  "staff",
  "items",
] as const;

async function tryHubRelayLedgerFallback(companyId: string): Promise<{ ok: boolean; fullPull: boolean }> {
  if (!isPlHubServerClientMode()) return { ok: false, fullPull: false };
  try {
    const {
      refreshPlServerDisplayCacheCompany,
      plServerDisplayCacheHasUsableLedger,
      hydratePlServerDisplayCacheFromIdb,
    } = await import("@/lib/plServerDisplayCache");
    await hydratePlServerDisplayCacheFromIdb(companyId).catch(() => undefined);
    if (plServerDisplayCacheHasUsableLedger(companyId)) {
      return { ok: true, fullPull: true };
    }
    await refreshPlServerDisplayCacheCompany(companyId, {
      focusCollections: [...HUB_STAFF_FOCUS_COLLECTIONS],
    });
    const ok = plServerDisplayCacheHasUsableLedger(companyId);
    return { ok, fullPull: ok };
  } catch {
    return { ok: false, fullPull: false };
  }
}

/** Hub: one delta pull + small focus cache fallback — no legacy retry / full-company refresh storm. */
async function resolveHubStaffConnectPullResult(
  companyId: string,
  syncOptions: { pullFullLedger?: boolean; serverGate?: GateRecord | null },
  timeoutMs: number,
  pullFull: boolean
): Promise<{ ok: boolean; fullPull: boolean }> {
  const { plGateTrace } = await import("@/lib/plGateTrace");
  if (await hubStaffLedgerSatisfiesPull(companyId, pullFull)) {
    plGateTrace("staff_connect_hub_ledger_already_ready", { companyId, fullPull: pullFull });
    return { ok: true, fullPull: pullFull };
  }

  const hubTimeout = Math.min(timeoutMs, 35_000);
  const { syncPlServerSharedCompaniesToLocalSqliteLegacy } = await import("@/lib/plServerClientCompanyDelta");
  plGateTrace("staff_connect_hub_single_pull_start", { companyId, pullFull, hubTimeout });
  await Promise.race([
    syncPlServerSharedCompaniesToLocalSqliteLegacy({
      companyIds: [companyId],
      pullFullLedger: pullFull,
      serverGate: syncOptions.serverGate,
    }).catch(() => ({ synced: 0, fullPull: 0, changedCollections: [] as never[] })),
    new Promise<void>((resolve) => {
      setTimeout(resolve, hubTimeout);
    }),
  ]);

  if (await hubStaffLedgerSatisfiesPull(companyId, pullFull)) {
    plGateTrace("staff_connect_hub_single_pull_ok", { companyId, fullPull: pullFull });
    return { ok: true, fullPull: pullFull };
  }

  const fallback = await tryHubRelayLedgerFallback(companyId);
  if (fallback.ok && (await hubStaffLedgerSatisfiesPull(companyId, pullFull))) {
    plGateTrace("staff_connect_hub_focus_cache_ok", { companyId, fullPull: pullFull });
    return { ok: true, fullPull: pullFull };
  }

  plGateTrace("staff_connect_done", { companyId, ok: false, fullPull: false });
  return { ok: false, fullPull: false };
}

async function resolveStaffConnectPullResult(
  companyId: string,
  syncOptions: { pullFullLedger?: boolean; serverGate?: GateRecord | null },
  timeoutMs: number,
  pullFull: boolean
): Promise<{ ok: boolean; fullPull: boolean }> {
  if (isPlHubServerClientMode()) {
    return resolveHubStaffConnectPullResult(companyId, syncOptions, timeoutMs, pullFull);
  }
  const { plGateTrace } = await import("@/lib/plGateTrace");
  const legacy = await pullLegacyStaffLedger(companyId, syncOptions, timeoutMs);
  if (legacy.synced) {
    plGateTrace("staff_connect_done", { companyId, ok: true, fullPull: legacy.fullPull && pullFull });
    return { ok: true, fullPull: legacy.fullPull && pullFull };
  }
  plGateTrace("staff_connect_done", { companyId, ok: false, fullPull: false });
  return { ok: false, fullPull: false };
}

/** Connect / gate: company shell row (picker) + SQLite ledger delta pull. */
export async function ensurePlServerStaffCompanyShell(companyId: string): Promise<void> {
  const id = String(companyId || "").trim();
  if (!id) return;
  const shared = getPlServerSharedCompanies().find((row) => String(row.id || "").trim() === id);

  try {
    const { getLocalCompanyById } = await import("@/lib/localCompanyStore");
    const existing = await getLocalCompanyById(id, { includeDeleted: true });
    if (existing && isServerGateCompany(existing)) {
      // Shell pehle se hai — host plan refresh (pocket-ledger.com ke bina)
      if (shared) {
        try {
          const { applyPlServerHostPlanToLocalCompany, plServerHostPlanFieldsFromSummary } = await import(
            "@/lib/plServerHostPlanSync"
          );
          const planFields = plServerHostPlanFieldsFromSummary(shared);
          if (planFields) await applyPlServerHostPlanToLocalCompany(id, planFields);
        } catch {
          /* optional */
        }
      }
      return;
    }
  } catch {
    /* continue */
  }

  const { plServerClientLocalCompanyRow } = await import("@/lib/plServerClientCompanyDelta");
  const hostPlan = shared
    ? {
        planId: shared.planId ?? null,
        planExpiryMs: shared.planExpiryMs ?? null,
        offlineLicenseValidUntilMs: shared.offlineLicenseValidUntilMs ?? null,
      }
    : null;
  await upsertLocalCompany(
    plServerClientLocalCompanyRow(id, String(shared?.name || id), shared?.ownerEmail ?? null, hostPlan)
  );
  if (shared) {
    try {
      const { applyPlServerHostPlanToLocalCompany, plServerHostPlanFieldsFromSummary } = await import(
        "@/lib/plServerHostPlanSync"
      );
      const planFields = plServerHostPlanFieldsFromSummary(shared);
      if (planFields) await applyPlServerHostPlanToLocalCompany(id, planFields);
    } catch {
      /* optional */
    }
  }
}

/**
 * Staff connect / company open: SQLite mirror pull (EXE/APK/iOS same).
 * Offline: existing SQLite rows are enough; display cache hydrate is optional warm.
 */
export async function preparePlServerStaffCompanyConnect(
  companyId: string,
  options?: {
    pullFullLedger?: boolean;
    timeoutMs?: number;
    background?: boolean;
    plServerGate?: GateRecord | null;
    skipHubGateReady?: boolean;
  }
): Promise<{ ok: boolean; fullPull: boolean }> {
  const id = String(companyId || "").trim();
  if (!id) return { ok: false, fullPull: false };

  const inflight = staffConnectInflight.get(id);
  if (inflight) return inflight;

  const task = preparePlServerStaffCompanyConnectInner(id, options);
  staffConnectInflight.set(id, task);
  try {
    return await task;
  } finally {
    staffConnectInflight.delete(id);
  }
}

async function preparePlServerStaffCompanyConnectInner(
  companyId: string,
  options?: {
    pullFullLedger?: boolean;
    timeoutMs?: number;
    background?: boolean;
    plServerGate?: GateRecord | null;
    skipHubGateReady?: boolean;
  }
): Promise<{ ok: boolean; fullPull: boolean }> {
  const id = String(companyId || "").trim();
  if (!id) return { ok: false, fullPull: false };

  const gate =
    options?.plServerGate ??
    (getActiveGate().type === "local_server" ? getActiveGate() : null);
  if (!options?.skipHubGateReady) {
    const hubReady = await ensurePlServerHubGateReadyForStaffConnect(gate);
    if (!hubReady.ok) return { ok: false, fullPull: false };
  }

  const timeoutMs = options?.timeoutMs ?? 45_000;
  const { plGateTrace } = await import("@/lib/plGateTrace");
  plGateTrace("staff_connect_start", { companyId: id, pullFullLedger: options?.pullFullLedger !== false, timeoutMs });

  const syncOptions = {
    pullFullLedger: options?.pullFullLedger !== false,
    serverGate: gate,
  };

  if (!isPlServerThinStaffClient()) {
    if (options?.background) {
      void pullLegacyStaffLedger(id, syncOptions, timeoutMs);
      return { ok: true, fullPull: false };
    }
    return resolveStaffConnectPullResult(id, syncOptions, timeoutMs, syncOptions.pullFullLedger !== false);
  }

  await ensurePlServerStaffCompanyShell(id);
  const pullFull = options?.pullFullLedger !== false;

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    try {
      const { listCompanyDocsFromBrowserDb } = await import("@/lib/localCompanyDocMirror");
      const vouchers = await listCompanyDocsFromBrowserDb(id, "vouchers");
      if (vouchers.length > 0) return { ok: true, fullPull: false };
    } catch {
      /* continue */
    }
    try {
      const { hydratePlServerDisplayCacheFromIdb, plServerDisplayCacheHasUsableLedger } = await import(
        "@/lib/plServerDisplayCache"
      );
      await hydratePlServerDisplayCacheFromIdb(id);
      return { ok: plServerDisplayCacheHasUsableLedger(id), fullPull: false };
    } catch {
      return { ok: false, fullPull: false };
    }
  }

  if (options?.background) {
    void pullLegacyStaffLedger(id, { ...syncOptions, pullFullLedger: pullFull }, timeoutMs);
    return { ok: true, fullPull: false };
  }

  if (isPlHubServerClientMode() && (await hubStaffLedgerSatisfiesPull(id, pullFull))) {
    plGateTrace("staff_connect_hub_ledger_already_ready", { companyId: id, fullPull: pullFull });
    return { ok: true, fullPull: pullFull };
  }

  return resolveStaffConnectPullResult(id, { ...syncOptions, pullFullLedger: pullFull }, timeoutMs, pullFull);
}

/** Gate + CompanySelector: login → ledger pull (EXE/static staff client). */
export async function unlockPlServerStaffCompanyWithLedgerPull(
  companyId: string,
  username: string,
  password: string,
  options?: {
    plServerGate?: import("@/lib/gates/gateTypes").GateRecord | null;
    appUser?: { uid?: string | null; email?: string | null };
    rememberUnlockDays?: number;
    timeoutMs?: number;
    /** Login OK — ledger pull shuru; dialog band karne ke liye. */
    onLedgerPullStart?: () => void;
  }
): Promise<{ ok: boolean; error?: string }> {
  const id = String(companyId || "").trim();
  const u = String(username || "").trim();
  const p = String(password || "").trim();
  if (!id || !u || !p) return { ok: false, error: "Enter both login username and password." };

  const { plGateTrace } = await import("@/lib/plGateTrace");
  plGateTrace("staff_unlock_login_start", { companyId: id });

  const hubReady = await ensurePlServerHubGateReadyForStaffConnect(options?.plServerGate ?? null);
  if (!hubReady.ok) {
    return { ok: false, error: hubReady.message || "Could not connect to server gate." };
  }

  const { localAuthLoginForCompanyContext } = await import("@/lib/localCompanyUsers");
  const { setLocalAuthToken } = await import("@/lib/localApiClient");
  const { saveOfflineUnlockSession } = await import("@/lib/offlineCompanyUnlockRemember");

  try {
    const { token, user: localUser } = await localAuthLoginForCompanyContext(id, u, p, {
      plServerGate: options?.plServerGate ?? null,
      forcePlServerRemote: true,
      skipPostLoginSync: true,
      appUser: options?.appUser,
    });
    setLocalAuthToken(id, token, localUser);
    saveOfflineUnlockSession(
      options?.appUser?.uid ?? undefined,
      id,
      options?.rememberUnlockDays ?? 0,
      token,
      localUser,
      options?.appUser?.email
    );
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Login failed." };
  }

  // Authentication is complete and the local session is durable. Open the
  // SQLite-backed company now; remote permission/meta refresh must not hold the
  // credential dialog or dashboard navigation behind a slow server request.
  plGateTrace("staff_unlock_ledger_pull_start", { companyId: id });
  try {
    options?.onLedgerPullStart?.();
  } catch {
    /* optional */
  }
  void import("@/lib/plServerCompanyMetaSync")
    .then(({ pullPlServerCompanyMetaFromHost }) => pullPlServerCompanyMetaFromHost(id))
    .catch(() => undefined);
  try {
    const { clearPlServerLivePullPause } = await import("@/lib/plServerClientDeltaSync");
    clearPlServerLivePullPause(id);
  } catch {
    /* optional */
  }
  let pulled = await preparePlServerStaffCompanyConnect(id, {
    pullFullLedger: true,
    timeoutMs: options?.timeoutMs ?? (isPlHubServerClientMode() ? 45_000 : 120_000),
    plServerGate: options?.plServerGate ?? null,
    skipHubGateReady: true,
  });
  if (!pulled.ok) {
    if (isPlHubServerClientMode() && (await hubStaffLedgerSatisfiesPull(id, true))) {
      plGateTrace("staff_unlock_ledger_ready_after_pull_miss", { companyId: id });
      pulled = { ok: true, fullPull: true };
    } else {
      try {
        const { clearLocalAuth } = await import("@/lib/localApiClient");
        await clearLocalAuth(id);
      } catch {
        /* ignore */
      }
      return {
        ok: false,
        error:
          "Could not sync ledger from server. Keep sharing ON on the host PC, then Gate → Test and try again.",
      };
    }
  }
  plGateTrace("staff_unlock_done", { companyId: id, fullPull: pulled.fullPull });
  try {
    const { pullPlServerCompanyMetaFromHost } = await import("@/lib/plServerCompanyMetaSync");
    await pullPlServerCompanyMetaFromHost(id);
  } catch {
    /* optional */
  }
  try {
    const { clearPlServerLivePullPause } = await import("@/lib/plServerClientDeltaSync");
    clearPlServerLivePullPause(id);
  } catch {
    /* optional */
  }
  try {
    const { PL_SERVER_ACCESS_CONTEXT_EVENT } = await import("@/lib/plServerAccessContext");
    const { LOCAL_AUTH_CHANGED_EVENT } = await import("@/lib/localApiClient");
    window.dispatchEvent(new Event(PL_SERVER_ACCESS_CONTEXT_EVENT));
    window.dispatchEvent(new Event(LOCAL_AUTH_CHANGED_EVENT));
  } catch {
    /* optional */
  }
  return { ok: true };
}
