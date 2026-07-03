"use client";

import { useEffect, useRef, useState } from "react";
import { useCompany } from "@/hooks/useCompany";
import { LOCAL_AUTH_CHANGED_EVENT } from "@/lib/localApiClient";
import { PL_GATE_CHANGED_EVENT } from "@/lib/gates/gateTypes";
import { PL_SERVER_ACCESS_CONTEXT_EVENT } from "@/lib/plServerAccessContext";
import { syncPlServerSharedCompanyLive, isPlServerLivePullPaused } from "@/lib/plServerClientMirrorPush";
import { listCompanyDocsFromBrowserDb } from "@/lib/localCompanyDocMirror";
import {
  buildLivePullSchedulerSnapshot,
  livePullDevLog,
} from "@/lib/plServerLivePullDevLog";

const LIVE_POLL_MS = 4_000;

/** P2P client: poll + reconnect pull — server → client. Local save ke bump par pull mat karo (stale server client edit overwrite karta tha). */
export function PlServerLiveSyncManager() {
  const { companyId, company } = useCompany();
  const syncingRef = useRef(false);
  const lastPullRef = useRef(0);
  const effectRunRef = useRef(0);
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
    const snap = buildLivePullSchedulerSnapshot(companyId, company);
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

    const runPull = async (reason: string) => {
      if (syncingRef.current) {
        livePullDevLog("poll_skipped", { reason: "sync_in_flight", trigger: reason, companyId: id });
        return;
      }
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        livePullDevLog("poll_skipped", { reason: "offline", trigger: reason, companyId: id });
        return;
      }
      if (isPlServerLivePullPaused(id)) {
        livePullDevLog("poll_skipped", { reason: "live_pull_paused", trigger: reason, companyId: id });
        return;
      }
      const now = Date.now();
      if (reason === "poll" && now - lastPullRef.current < LIVE_POLL_MS - 500) {
        livePullDevLog("poll_skipped", { reason: "poll_debounce", trigger: reason, companyId: id });
        return;
      }
      livePullDevLog("poll_started", { trigger: reason, companyId: id, sharedCompaniesCount: snap.sharedCompaniesCount });
      syncingRef.current = true;
      try {
        const result = await syncPlServerSharedCompanyLive(id);
        lastPullRef.current = Date.now();
        livePullDevLog("pull_finished", {
          trigger: reason,
          companyId: id,
          ok: result.ok,
          fullPull: result.fullPull,
        });
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
      pollMs: LIVE_POLL_MS,
      ...snap,
    });
    void runPull("mount");
    const interval = window.setInterval(() => void runPull("poll"), LIVE_POLL_MS);
    const onOnline = () => void runPull("online");
    window.addEventListener("online", onOnline);

    return () => {
      livePullDevLog("scheduler_stopped", { runNumber, schedulerEpoch, companyId: id });
      window.clearInterval(interval);
      window.removeEventListener("online", onOnline);
    };
  }, [companyId, company?.plServerShared, company?.storageOption, schedulerEpoch]);

  return null;
}
