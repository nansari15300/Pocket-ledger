"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useCompany } from "@/hooks/useCompany";
import { LOCAL_AUTH_CHANGED_EVENT } from "@/lib/localApiClient";
import { PL_GATE_CHANGED_EVENT } from "@/lib/gates/gateTypes";
import { PL_SERVER_ACCESS_CONTEXT_EVENT } from "@/lib/plServerAccessContext";
import { syncPlServerSharedCompanyLive, isPlServerLivePullPaused } from "@/lib/plServerClientMirrorPush";
import {
  BROWSER_DB_COLLECTION_BUMP,
  listCompanyDocsFromBrowserDb,
  type BrowserDbCollectionBumpDetail,
} from "@/lib/localCompanyDocMirror";
import {
  buildLivePullSchedulerSnapshot,
  livePullDevLog,
} from "@/lib/plServerLivePullDevLog";
import { markPlServerReadSyncReconnecting, getPlServerReadSyncHealth } from "@/lib/plServerReadSyncHealth";
import { isPlServerThinStaffClient } from "@/lib/plServerThinStaffClient";
import { plServerLiveCollectionsForPathname } from "@/lib/plServerVisiblePageLiveCache";

const LIVE_FOCUS_POLL_MS = 3_000;
const LIVE_FULL_CHECK_MS = 25_000;
const LIVE_POLL_MS_AFTER_FAILURE = 20_000;
/** P2P client: poll + reconnect pull — server → client. Local save ke bump par pull mat karo (stale server client edit overwrite karta tha). */
export function PlServerLiveSyncManager() {
  const pathname = usePathname();
  const { companyId, company } = useCompany();
  const companyPlServerShared = company?.plServerShared;
  const companyStorageOption = company?.storageOption;
  const companyRowId = company?.id;
  const syncingRef = useRef(false);
  const lastPullRef = useRef(0);
  const pollIntervalMsRef = useRef(LIVE_FOCUS_POLL_MS);
  const pollTimerRef = useRef<number | null>(null);
  const fullCheckTimerRef = useRef<number | null>(null);
  const effectRunRef = useRef(0);
  const pathnameRef = useRef(pathname);
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
      setSchedulerEpoch((n) => {
        const next = n + 1;
        livePullDevLog("scheduler_epoch_bump", { schedulerEpoch: next });
        return next;
      });
    };
    window.addEventListener(PL_GATE_CHANGED_EVENT, bump);
    window.addEventListener(LOCAL_AUTH_CHANGED_EVENT, bump);
    window.addEventListener(PL_SERVER_ACCESS_CONTEXT_EVENT, bump);
    return () => {
      window.removeEventListener(PL_GATE_CHANGED_EVENT, bump);
      window.removeEventListener(LOCAL_AUTH_CHANGED_EVENT, bump);
      window.removeEventListener(PL_SERVER_ACCESS_CONTEXT_EVENT, bump);
    };
  }, []);

  useEffect(() => {
    effectRunRef.current += 1;
    const runNumber = effectRunRef.current;
    const snap = buildLivePullSchedulerSnapshot(
      companyId,
      companyId
        ? {
            plServerShared: companyPlServerShared,
            storageOption: companyStorageOption,
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

    const id = snap.companyId;
    if (!id) {
      livePullDevLog("scheduler_not_started", { runNumber, reason: "no_company_id", blockers: snap.blockers });
      return;
    }
    if (!snap.accessContextEnabled) {
      livePullDevLog("scheduler_not_started", {
        runNumber,
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
      return;
    }
    if (!snap.isServerRow) {
      livePullDevLog("scheduler_not_started", {
        runNumber,
        reason: "companySharedFalse",
        blockers: snap.blockers,
        companyPlServerShared: snap.companyPlServerShared,
      });
      return;
    }

    function schedulePoll() {
      if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = window.setInterval(() => void runPull("focus_poll"), pollIntervalMsRef.current);
      if (fullCheckTimerRef.current) window.clearInterval(fullCheckTimerRef.current);
      fullCheckTimerRef.current = window.setInterval(() => void runPull("full_check"), LIVE_FULL_CHECK_MS);
    }

    const runPull = async (reason: string) => {
      if (syncingRef.current) {
        livePullDevLog("poll_skipped", { reason: "sync_in_flight", trigger: reason, companyId: id });
        return;
      }
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        if (!isPlServerThinStaffClient()) {
          livePullDevLog("poll_skipped", { reason: "offline", trigger: reason, companyId: id });
          return;
        }
      }
      if (isPlServerLivePullPaused(id)) {
        livePullDevLog("poll_skipped", { reason: "live_pull_paused", trigger: reason, companyId: id });
        return;
      }
      const now = Date.now();
      const pollDebounceMs = Math.max(500, pollIntervalMsRef.current - 500);
      if ((reason === "focus_poll" || reason === "local_bump_focus") && now - lastPullRef.current < pollDebounceMs) {
        livePullDevLog("poll_skipped", { reason: "poll_debounce", trigger: reason, companyId: id });
        return;
      }
      livePullDevLog("poll_started", { trigger: reason, companyId: id, sharedCompaniesCount: snap.sharedCompaniesCount });
      syncingRef.current = true;
      try {
        const fullCheck = reason === "mount" || reason === "full_check";
        const focusCollections = fullCheck ? undefined : plServerLiveCollectionsForPathname(pathnameRef.current);
        const result = await syncPlServerSharedCompanyLive(id, {
          pollOnly: reason !== "mount",
          focusCollections,
        });
        lastPullRef.current = Date.now();
        livePullDevLog("pull_finished", {
          trigger: reason,
          companyId: id,
          ok: result.ok,
          fullPull: result.fullPull,
          focusCollections,
          changedCollections: result.changedCollections,
        });
        if (result.ok) {
          pollIntervalMsRef.current = LIVE_FOCUS_POLL_MS;
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
    void runPull("mount");
    schedulePoll();
    const onOnline = () => {
      markPlServerReadSyncReconnecting(id);
      pollIntervalMsRef.current = LIVE_FOCUS_POLL_MS;
      schedulePoll();
      void runPull("online");
    };
    const onLocalBump = (event: Event) => {
      const detail = (event as CustomEvent<BrowserDbCollectionBumpDetail>).detail;
      if (!detail || detail.companyId !== id) return;
      const focusCollections = plServerLiveCollectionsForPathname(pathnameRef.current);
      if (!(focusCollections as readonly string[]).includes(detail.collection)) return;
      window.setTimeout(() => void runPull("local_bump_focus"), 250);
    };
    window.addEventListener("online", onOnline);
    window.addEventListener(BROWSER_DB_COLLECTION_BUMP, onLocalBump);

    return () => {
      livePullDevLog("scheduler_stopped", { runNumber, schedulerEpoch, companyId: id });
      if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
      if (fullCheckTimerRef.current) window.clearInterval(fullCheckTimerRef.current);
      pollTimerRef.current = null;
      fullCheckTimerRef.current = null;
      window.removeEventListener("online", onOnline);
      window.removeEventListener(BROWSER_DB_COLLECTION_BUMP, onLocalBump);
    };
  }, [companyId, companyPlServerShared, companyStorageOption, companyRowId, schedulerEpoch, pathname]);

  /** Route change: open page ke collections turant server se refresh. */
  useEffect(() => {
    if (pathnameRef.current === pathname) return;
    pathnameRef.current = pathname;
    if (!companyId) return;
    const id = String(companyId).trim();
    if (!id || syncingRef.current) return;
    void (async () => {
      if (syncingRef.current) return;
      syncingRef.current = true;
      try {
        const focusCollections = plServerLiveCollectionsForPathname(pathname);
        const result = await syncPlServerSharedCompanyLive(id, {
          pollOnly: true,
          focusCollections,
        });
        livePullDevLog("route_pull_finished", {
          companyId: id,
          ok: result.ok,
          focusCollections,
          changedCollections: result.changedCollections,
        });
      } finally {
        syncingRef.current = false;
      }
    })();
  }, [pathname, companyId]);

  return null;
}
