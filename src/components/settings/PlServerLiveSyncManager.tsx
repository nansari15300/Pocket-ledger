"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useCompany } from "@/hooks/useCompany";
import { LOCAL_AUTH_CHANGED_EVENT } from "@/lib/localApiClient";
import { PL_GATE_CHANGED_EVENT } from "@/lib/gates/gateTypes";
import { refreshPlServerAccessContext } from "@/lib/plServerAccessContext";
import {
  registerPlServerCompanyTransportHint,
  resolvePlServerDeltaTransport,
  syncPlServerSharedCompanyLive,
  isPlServerRemoteLivePullReason,
} from "@/lib/plServerClientDeltaSync";
import { plServerCompanyLedgerNeedsFullPull } from "@/lib/plServerLedgerDeltaGate";
import {
  BROWSER_DB_COLLECTION_BUMP,
  listCompanyDocsFromBrowserDb,
  notifyBrowserDbCollectionUpdated,
  type BrowserDbCollectionBumpDetail,
} from "@/lib/localCompanyDocMirror";
import {
  buildLivePullSchedulerSnapshot,
  livePullDevLog,
  plServerVoucherFlowLog,
} from "@/lib/plServerLivePullDevLog";
import { markPlServerReadSyncReconnecting, getPlServerReadSyncHealth } from "@/lib/plServerReadSyncHealth";
import { shouldRunPlServerContinuousLiveSync } from "@/lib/plGatePageOrigin";
import { isPlHubServerClientMode } from "@/lib/plRemoteServerClient";
import { isPlServerThinStaffClient } from "@/lib/plServerThinStaffClient";
import { plServerLiveCollectionsForPathname } from "@/lib/plServerVisiblePageLiveCache";
import type { CompanyBackupCollection } from "@/lib/companyBackupCollections";
import { readCurrentAppAccountIdentity } from "@/lib/appAccountIdentity";

const LIVE_FOCUS_POLL_MS = 15_000;
const LIVE_FULL_CHECK_MS = 60_000;
const LIVE_POLL_MS_AFTER_FAILURE = 60_000;
const LIVE_SERVER_EVENT_RETRY_MS = 15_000;
const HUB_COMPANY_META_POLL_MS = 30_000;

function isParallelFocusPullReason(reason: string): boolean {
  return (
    reason === "focus_poll" ||
    reason === "window_focus" ||
    reason === "visibility_visible" ||
    reason.startsWith("server_event_") ||
    reason.startsWith("remote_bump_") ||
    reason.startsWith("queued_remote_bump_")
  );
}
/** P2P client: poll + reconnect pull — server → client. Local save ke bump par pull mat karo (stale server client edit overwrite karta tha). */
export function PlServerLiveSyncManager() {
  const pathname = usePathname();
  const { companyId, company } = useCompany();
  const companyPlServerShared = company?.plServerShared;
  const companyStorageOption = company?.storageOption;
  const companySyncedFromCloud = company?.syncedFromCloud;
  const companyRowId = company?.id;
  const companyPlServerGateId = (company as { plServerGateId?: string } | null | undefined)?.plServerGateId;
  const companyPlServerGateServerUrl = (company as { plServerGateServerUrl?: string } | null | undefined)?.plServerGateServerUrl;
  const companyPlServerHostCompanyId = (company as { plServerHostCompanyId?: string } | null | undefined)?.plServerHostCompanyId;
  const companyMetaRef = useRef({
    companyPlServerShared,
    companyStorageOption,
    companySyncedFromCloud,
    companyRowId,
    companyPlServerGateId,
    companyPlServerGateServerUrl,
    companyPlServerHostCompanyId,
  });
  companyMetaRef.current = {
    companyPlServerShared,
    companyStorageOption,
    companySyncedFromCloud,
    companyRowId,
    companyPlServerGateId,
    companyPlServerGateServerUrl,
    companyPlServerHostCompanyId,
  };
  const syncingRef = useRef(false);
  const focusSyncingRef = useRef(false);
  const lastPullRef = useRef(0);
  const pollIntervalMsRef = useRef(LIVE_FOCUS_POLL_MS);
  const pollTimerRef = useRef<number | null>(null);
  const fullCheckTimerRef = useRef<number | null>(null);
  const effectRunRef = useRef(0);
  const pathnameRef = useRef(pathname);
  const pendingPullReasonRef = useRef<string | null>(null);
  const schedulerBumpTimerRef = useRef<number | null>(null);
  const serverEventRetryTimerRef = useRef<number | null>(null);
  const [schedulerEpoch, setSchedulerEpoch] = useState(0);

  useEffect(() => {
    livePullDevLog("component_mounted");
    return () => {
      livePullDevLog("component_unmounted");
    };
  }, []);

  /** Gate / local auth / shared-company context — scheduler re-arm when prerequisites arrive after mount. */
  useEffect(() => {
    const bump = () => {
      if (schedulerBumpTimerRef.current != null) {
        window.clearTimeout(schedulerBumpTimerRef.current);
      }
      schedulerBumpTimerRef.current = window.setTimeout(() => {
        schedulerBumpTimerRef.current = null;
        setSchedulerEpoch((n) => {
          const next = n + 1;
          livePullDevLog("scheduler_epoch_bump", { schedulerEpoch: next });
          return next;
        });
      }, 100);
    };
    window.addEventListener(PL_GATE_CHANGED_EVENT, bump);
    window.addEventListener(LOCAL_AUTH_CHANGED_EVENT, bump);
    return () => {
      if (schedulerBumpTimerRef.current != null) {
        window.clearTimeout(schedulerBumpTimerRef.current);
        schedulerBumpTimerRef.current = null;
      }
      if (serverEventRetryTimerRef.current != null) {
        window.clearTimeout(serverEventRetryTimerRef.current);
        serverEventRetryTimerRef.current = null;
      }
      window.removeEventListener(PL_GATE_CHANGED_EVENT, bump);
      window.removeEventListener(LOCAL_AUTH_CHANGED_EVENT, bump);
    };
  }, []);

  useEffect(() => {
    effectRunRef.current += 1;
    const runNumber = effectRunRef.current;
    const meta = companyMetaRef.current;
    const snap = buildLivePullSchedulerSnapshot(
      companyId,
      companyId
        ? {
            id: meta.companyRowId,
            plServerShared: meta.companyPlServerShared,
            storageOption: meta.companyStorageOption,
            syncedFromCloud: meta.companySyncedFromCloud,
            plServerGateId: meta.companyPlServerGateId,
            plServerGateServerUrl: meta.companyPlServerGateServerUrl,
            plServerHostCompanyId: meta.companyPlServerHostCompanyId,
          }
        : null
    );
    livePullDevLog("effect_run", {
      runNumber,
      schedulerEpoch,
      deps: {
        companyId: snap.companyId || null,
        plServerShared: snap.companyPlServerShared,
        storageOption: snap.storageOption,
        schedulerEpoch,
      },
      ...snap,
    });

    if (!shouldRunPlServerContinuousLiveSync()) {
      livePullDevLog("scheduler_not_started", {
        runNumber,
        reason: "hub_origin_no_live_sync",
        blockers: snap.blockers,
      });
      return;
    }

    const id = snap.companyId;
    if (id && meta.companyPlServerGateServerUrl) {
      registerPlServerCompanyTransportHint(id, meta.companyPlServerGateServerUrl);
    }
    if (!id) {
      livePullDevLog("scheduler_not_started", { runNumber, reason: "no_company_id", blockers: snap.blockers });
      plServerVoucherFlowLog("scheduler_not_started", { runNumber, reason: "no_company_id", blockers: snap.blockers });
      return;
    }
    if (!snap.accessContextEnabled) {
      livePullDevLog("scheduler_not_started", {
        runNumber,
        reason: "accessContextFalse",
        blockers: snap.blockers,
      });
      plServerVoucherFlowLog("scheduler_not_started", {
        runNumber,
        companyId: id,
        reason: "accessContextFalse",
        blockers: snap.blockers,
      });
      return;
    }
    if (!snap.canSync) {
      livePullDevLog("scheduler_not_started", {
        runNumber,
        reason: "canSync_false",
        blockers: snap.blockers,
        activeGateId: snap.activeGateId,
        activeGateType: snap.activeGateType,
        gateConnected: snap.gateConnected,
        localAuthTokenPresent: snap.localAuthTokenPresent,
        gateCompanyAllowed: snap.gateCompanyAllowed,
      });
      plServerVoucherFlowLog("scheduler_not_started", {
        runNumber,
        companyId: id,
        reason: "canSync_false",
        blockers: snap.blockers,
        activeGateType: snap.activeGateType,
        gateConnected: snap.gateConnected,
        localAuthTokenPresent: snap.localAuthTokenPresent,
        gateCompanyAllowed: snap.gateCompanyAllowed,
      });
      return;
    }
    if (!snap.isServerRow) {
      livePullDevLog("scheduler_not_started", {
        runNumber,
        reason: "companySharedFalse",
        blockers: snap.blockers,
        companyPlServerShared: snap.companyPlServerShared,
      });
      plServerVoucherFlowLog("scheduler_not_started", {
        runNumber,
        companyId: id,
        reason: "companySharedFalse",
        blockers: snap.blockers,
        companyPlServerShared: snap.companyPlServerShared,
      });
      return;
    }

    function schedulePoll() {
      if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = window.setInterval(() => {
        if (document.visibilityState !== "visible") return;
        void runPull("focus_poll");
      }, pollIntervalMsRef.current);
      if (fullCheckTimerRef.current) window.clearInterval(fullCheckTimerRef.current);
      fullCheckTimerRef.current = window.setInterval(() => {
        if (document.visibilityState !== "visible") return;
        void runPull("full_check");
      }, LIVE_FULL_CHECK_MS);
    }

    const runPull = async (reason: string) => {
      const remoteTriggered = isPlServerRemoteLivePullReason(reason);
      const parallelFocus = isParallelFocusPullReason(reason);
      if (syncingRef.current) {
        if (parallelFocus && !focusSyncingRef.current) {
          focusSyncingRef.current = true;
          try {
            if (isPlHubServerClientMode() || isPlServerThinStaffClient()) {
              const { pullPlServerCompanyMetaFromHost } = await import("@/lib/plServerCompanyMetaSync");
              await pullPlServerCompanyMetaFromHost(id).catch(() => undefined);
            }
            const focusCollectionsForLog = plServerLiveCollectionsForPathname(pathnameRef.current);
            const serverEventCollectionMatch = reason.match(/^server_event_(.+)$/);
            const serverEventCollection = serverEventCollectionMatch?.[1]?.trim() || "";
            let focusCollections = focusCollectionsForLog;
            if (serverEventCollection) {
              focusCollections = [
                ...new Set([serverEventCollection, ...focusCollectionsForLog]),
              ] as CompanyBackupCollection[];
            }
            const result = await syncPlServerSharedCompanyLive(id, {
              pollOnly: true,
              focusCollections,
              ignoreLivePullPause: true,
              pullReason: reason,
            });
            if (result.ok && result.changedCollections?.length) {
              for (const col of result.changedCollections) {
                notifyBrowserDbCollectionUpdated(id, col, { immediate: true, source: "pl_server_pull" });
              }
            }
          } finally {
            focusSyncingRef.current = false;
          }
          return;
        }
        livePullDevLog("poll_skipped", { reason: "sync_in_flight", trigger: reason, companyId: id });
        pendingPullReasonRef.current = reason;
        plServerVoucherFlowLog("poll_queued_after_in_flight", { trigger: reason, companyId: id });
        return;
      }
      if (focusSyncingRef.current && parallelFocus) {
        return;
      }
      if (reason === "focus_poll" && typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        if (!isPlServerThinStaffClient()) {
          livePullDevLog("poll_skipped", { reason: "offline", trigger: reason, companyId: id });
          plServerVoucherFlowLog("poll_skipped", { reason: "offline", trigger: reason, companyId: id });
          return;
        }
      }
      const now = Date.now();
      const pollDebounceMs = Math.max(400, pollIntervalMsRef.current - 400);
      const debounceReason = reason === "focus_poll";
      if (debounceReason && now - lastPullRef.current < pollDebounceMs) {
        livePullDevLog("poll_skipped", { reason: "poll_debounce", trigger: reason, companyId: id });
        plServerVoucherFlowLog("poll_skipped", {
          reason: "poll_debounce",
          trigger: reason,
          companyId: id,
          elapsedMs: now - lastPullRef.current,
          debounceMs: pollDebounceMs,
        });
        return;
      }
      const serverEventCollectionMatch = reason.match(/^server_event_(.+)$/);
      const serverEventCollection = serverEventCollectionMatch?.[1]?.trim() || "";
      const fullCheck = reason === "mount" || reason === "full_check";
      const mountLight = reason === "mount_light";
      let focusCollectionsForLog =
        fullCheck || serverEventCollection
          ? undefined
          : plServerLiveCollectionsForPathname(pathnameRef.current);
      if (serverEventCollection) {
        const pageCollections = plServerLiveCollectionsForPathname(pathnameRef.current);
        focusCollectionsForLog = [
          ...new Set([serverEventCollection, ...pageCollections]),
        ] as CompanyBackupCollection[];
      }
      livePullDevLog("poll_started", { trigger: reason, companyId: id, sharedCompaniesCount: snap.sharedCompaniesCount });
      if (!focusCollectionsForLog || (focusCollectionsForLog as readonly string[]).includes("vouchers")) {
        plServerVoucherFlowLog("poll_started", {
          trigger: reason,
          companyId: id,
          fullCheck,
          focusCollections: focusCollectionsForLog,
        });
      }
      syncingRef.current = true;
      let pullOk = false;
      try {
        if ((isPlHubServerClientMode() || isPlServerThinStaffClient()) && (reason === "focus_poll" || reason === "mount" || reason === "full_check")) {
          const { pullPlServerCompanyMetaFromHost } = await import("@/lib/plServerCompanyMetaSync");
          await pullPlServerCompanyMetaFromHost(id).catch(() => undefined);
        }
        if (reason === "mount" || reason === "full_check") {
          // Cached gate/company context is enough to paint and pull the active
          // company. Refresh permissions in parallel so a slow host cannot hold
          // the SQLite-first UI or focused voucher lane blank.
          void refreshPlServerAccessContext().catch(() => null);
        }
        const focusCollections = fullCheck ? undefined : focusCollectionsForLog;
        const result = await syncPlServerSharedCompanyLive(id, {
          pollOnly: mountLight || reason !== "mount",
          focusCollections,
          ignoreLivePullPause: remoteTriggered || mountLight,
          pullReason: reason,
        });
        pullOk = result.ok;
        lastPullRef.current = Date.now();
        livePullDevLog("pull_finished", {
          trigger: reason,
          companyId: id,
          ok: result.ok,
          fullPull: result.fullPull,
          focusCollections,
          changedCollections: result.changedCollections,
        });
        if (!focusCollections || (focusCollections as readonly string[]).includes("vouchers")) {
          const localVoucherCount = await listCompanyDocsFromBrowserDb(id, "vouchers", { forBackupMerge: true })
            .then((rows) => rows.filter((row) => (row as { isDeleted?: unknown }).isDeleted !== true).length)
            .catch(() => null);
          plServerVoucherFlowLog("poll_finished", {
            trigger: reason,
            companyId: id,
            ok: result.ok,
            fullPull: result.fullPull,
            focusCollections,
            changedCollections: result.changedCollections,
            localAliveAfter: localVoucherCount,
          });
        }
        const bumpCollections: CompanyBackupCollection[] =
          result.changedCollections?.length
            ? result.changedCollections
            : serverEventCollection
              ? ([serverEventCollection] as CompanyBackupCollection[])
              : [];
        if ((result.ok || remoteTriggered) && bumpCollections.length > 0) {
          pollIntervalMsRef.current = LIVE_FOCUS_POLL_MS;
          for (const col of bumpCollections) {
            notifyBrowserDbCollectionUpdated(id, col, { immediate: true, source: "pl_server_pull" });
            if (col === "vouchers") {
              plServerVoucherFlowLog("ui_bump_dispatched", {
                trigger: reason,
                companyId: id,
                collection: col,
              });
            }
          }
        } else {
          const health = getPlServerReadSyncHealth(id);
          const nextMs =
            health.consecutiveFailures >= 2 ? LIVE_POLL_MS_AFTER_FAILURE : LIVE_FOCUS_POLL_MS;
          if (nextMs !== pollIntervalMsRef.current) {
            pollIntervalMsRef.current = nextMs;
            schedulePoll();
          }
        }
        if (result.ok && reason === "mount") {
          const vouchers = await listCompanyDocsFromBrowserDb(id, "vouchers", { forBackupMerge: true });
          if (vouchers.length === 0) {
            console.warn("[PlServerLiveSyncManager] vouchers still empty after mount pull");
          }
        }
      } finally {
        syncingRef.current = false;
        const queuedReason = pendingPullReasonRef.current;
        pendingPullReasonRef.current = null;
        if (queuedReason) {
          window.setTimeout(() => void runPull(`queued_${queuedReason}`), pullOk ? 50 : 2_000);
        }
      }
    };

    livePullDevLog("scheduler_started", {
      runNumber,
      schedulerEpoch,
      companyId: id,
      pollMs: LIVE_FOCUS_POLL_MS,
      fullCheckMs: LIVE_FULL_CHECK_MS,
      ...snap,
    });
    // Let the dashboard paint its local SQLite projection first. Network sync still
    // starts within one second, but cannot monopolize the cold-start database read.
    const initialPullTimer = window.setTimeout(() => {
      void (async () => {
        const needsFull = await plServerCompanyLedgerNeedsFullPull(id);
        void runPull(needsFull ? "mount" : "mount_light");
      })();
    }, 750);
    schedulePoll();
    let eventSource: EventSource | null = null;
    let hubMetaTimer: number | null = null;
    const startServerEvents = () => {
      if (isPlHubServerClientMode() || isPlServerThinStaffClient()) {
        if (hubMetaTimer == null) {
          hubMetaTimer = window.setInterval(() => {
            if (document.visibilityState !== "visible") return;
            void import("@/lib/plServerCompanyMetaSync").then(({ pullPlServerCompanyMetaFromHost }) =>
              pullPlServerCompanyMetaFromHost(id)
            );
          }, HUB_COMPANY_META_POLL_MS);
          void import("@/lib/plServerCompanyMetaSync").then(({ pullPlServerCompanyMetaFromHost }) =>
            pullPlServerCompanyMetaFromHost(id)
          );
        }
      }
      if (typeof EventSource === "undefined") return;
      if (eventSource) return;
      const transport = resolvePlServerDeltaTransport(id);
      if (!transport) return;
      try {
        const url = new URL(`${transport.baseUrl.replace(/\/$/, "")}/__pl_company_delta_events`);
        url.searchParams.set("companyId", id);
        const appAccount = readCurrentAppAccountIdentity();
        if (appAccount) url.searchParams.set("appAccount", appAccount);
        eventSource = new EventSource(url.toString());
        eventSource.addEventListener("change", (event) => {
          let payload: { collection?: unknown; source?: unknown; docs?: unknown; company?: unknown } = {};
          try {
            payload = JSON.parse((event as MessageEvent).data || "{}") as typeof payload;
          } catch {
            payload = {};
          }
          const collection = String(payload.collection || "").trim();
          if (!collection) return;
          plServerVoucherFlowLog("server_event_pull", {
            companyId: id,
            collection,
            source: String(payload.source || ""),
          });
          if (collection === "company_meta") {
            if (payload.company && typeof payload.company === "object") {
              void import("@/lib/plServerCompanyMetaSync").then(
                ({ applyPlServerCompanyMetaPatch }) =>
                  applyPlServerCompanyMetaPatch(
                    id,
                    payload.company as Record<string, unknown>
                  )
              );
              return;
            }
            void (async () => {
              const { pullPlServerCompanyMetaFromHost } = await import("@/lib/plServerCompanyMetaSync");
              await pullPlServerCompanyMetaFromHost(id);
            })();
            return;
          }
          const liveDocs = Array.isArray(payload.docs)
            ? (payload.docs as Array<Record<string, unknown>>)
            : [];
          if (liveDocs.length > 0) {
            void (async () => {
              const { applyPlServerLiveDeltaDocs } = await import("@/lib/plServerClientCompanyDelta");
              const result = await applyPlServerLiveDeltaDocs(
                id,
                collection as CompanyBackupCollection,
                liveDocs
              );
              notifyBrowserDbCollectionUpdated(id, collection, {
                immediate: true,
                source: "pl_server_delta",
              });
              plServerVoucherFlowLog("server_event_docs_applied", {
                companyId: id,
                collection,
                received: liveDocs.length,
                upserted: result.upserted,
                skipped: result.skipped,
              });
            })();
            return;
          }
          notifyBrowserDbCollectionUpdated(id, collection, {
            immediate: true,
            source: "pl_server_pull",
          });
          void runPull(`server_event_${collection}`);
        });
        eventSource.onerror = () => {
          plServerVoucherFlowLog("server_event_error", { companyId: id });
          if (eventSource) {
            eventSource.close();
            eventSource = null;
          }
          if (serverEventRetryTimerRef.current != null) {
            window.clearTimeout(serverEventRetryTimerRef.current);
          }
          serverEventRetryTimerRef.current = window.setTimeout(() => {
            serverEventRetryTimerRef.current = null;
            const health = getPlServerReadSyncHealth(id);
            if (health.consecutiveFailures < 2 || typeof navigator === "undefined" || navigator.onLine) {
              startServerEvents();
            }
          }, LIVE_SERVER_EVENT_RETRY_MS);
        };
      } catch {
        eventSource = null;
      }
    };
    startServerEvents();
    const onOnline = () => {
      markPlServerReadSyncReconnecting(id);
      pollIntervalMsRef.current = LIVE_FOCUS_POLL_MS;
      schedulePoll();
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      if (serverEventRetryTimerRef.current != null) {
        window.clearTimeout(serverEventRetryTimerRef.current);
        serverEventRetryTimerRef.current = null;
      }
      startServerEvents();
      void runPull("online");
    };
    const onFocus = () => {
      void runPull("window_focus");
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void runPull("visibility_visible");
    };
    const electronTabBridge = (
      window as unknown as {
        plElectronTabBridge?: {
          onLiveSyncResume?: (callback: (payload: { reason?: string }) => void) => () => void;
        };
      }
    ).plElectronTabBridge;
    const unsubscribeElectronResume = electronTabBridge?.onLiveSyncResume?.((payload) => {
      markPlServerReadSyncReconnecting(id);
      pollIntervalMsRef.current = LIVE_FOCUS_POLL_MS;
      schedulePoll();
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      startServerEvents();
      void runPull(`electron_resume_${String(payload?.reason || "window")}`);
    });
    const onLocalBump = (event: Event) => {
      const detail = (event as CustomEvent<BrowserDbCollectionBumpDetail>).detail;
      if (!detail || detail.companyId !== id) return;
      if (detail.source === "pl_host_remote_write") {
        void import("@/lib/plServerLiveChangeTrace")
          .then(({ plServerLiveChangeTrace }) =>
            plServerLiveChangeTrace("live_pull_remote_bump", {
              companyId: id,
              collection: detail.collection,
            })
          )
          .catch(() => undefined);
        void runPull(`remote_bump_${detail.collection}`);
        return;
      }
      const focusCollections = plServerLiveCollectionsForPathname(pathnameRef.current);
      if (!(focusCollections as readonly string[]).includes(detail.collection)) return;
      plServerVoucherFlowLog("local_bump_seen_no_pull", {
        companyId: id,
        collection: detail.collection,
        source: detail.source || "local_write",
      });
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener(BROWSER_DB_COLLECTION_BUMP, onLocalBump);

    return () => {
      livePullDevLog("scheduler_stopped", { runNumber, schedulerEpoch, companyId: id });
      if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
      if (fullCheckTimerRef.current) window.clearInterval(fullCheckTimerRef.current);
      window.clearTimeout(initialPullTimer);
      if (eventSource) eventSource.close();
      if (hubMetaTimer != null) window.clearInterval(hubMetaTimer);
      if (serverEventRetryTimerRef.current != null) window.clearTimeout(serverEventRetryTimerRef.current);
      pollTimerRef.current = null;
      fullCheckTimerRef.current = null;
      eventSource = null;
      hubMetaTimer = null;
      serverEventRetryTimerRef.current = null;
      window.removeEventListener("online", onOnline);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener(BROWSER_DB_COLLECTION_BUMP, onLocalBump);
      unsubscribeElectronResume?.();
    };
  }, [companyId, schedulerEpoch, pathname]);

  /** Route change: open page ke collections turant server se refresh. */
  useEffect(() => {
    if (pathnameRef.current === pathname) return;
    pathnameRef.current = pathname;
    if (!companyId) return;
    const id = String(companyId).trim();
    if (!id) return;
    if (syncingRef.current) {
      pendingPullReasonRef.current = "route_change";
      plServerVoucherFlowLog("route_pull_queued_after_in_flight", {
        companyId: id,
        pathname,
      });
      return;
    }
    void (async () => {
      if (syncingRef.current) {
        pendingPullReasonRef.current = "route_change";
        plServerVoucherFlowLog("route_pull_queued_after_in_flight", {
          companyId: id,
          pathname,
        });
        return;
      }
      syncingRef.current = true;
      try {
        const focusCollections = plServerLiveCollectionsForPathname(pathname);
        const result = await syncPlServerSharedCompanyLive(id, {
          pollOnly: true,
          focusCollections,
          ignoreLivePullPause: true,
          pullReason: "route_change",
        });
        livePullDevLog("route_pull_finished", {
          companyId: id,
          ok: result.ok,
          focusCollections,
          changedCollections: result.changedCollections,
        });
        if ((focusCollections as readonly string[]).includes("vouchers")) {
          const localVoucherCount = await listCompanyDocsFromBrowserDb(id, "vouchers", { forBackupMerge: true })
            .then((rows) => rows.filter((row) => (row as { isDeleted?: unknown }).isDeleted !== true).length)
            .catch(() => null);
          plServerVoucherFlowLog("route_pull_finished", {
            companyId: id,
            ok: result.ok,
            focusCollections,
            changedCollections: result.changedCollections,
            localAliveAfter: localVoucherCount,
          });
        }
        if (result.ok) {
          for (const col of (result.changedCollections?.length ? result.changedCollections : focusCollections || [])) {
            notifyBrowserDbCollectionUpdated(id, col, { immediate: true, source: "pl_server_pull" });
            if (col === "vouchers") {
              plServerVoucherFlowLog("ui_bump_dispatched", {
                trigger: "route_change",
                companyId: id,
                collection: col,
              });
            }
          }
        }
      } finally {
        syncingRef.current = false;
      }
    })();
  }, [pathname, companyId]);

  return null;
}
