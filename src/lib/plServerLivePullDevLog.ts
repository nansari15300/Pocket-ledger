"use client";

import { getLocalAuthToken } from "@/lib/localApiClient";
import { getActiveGate } from "@/lib/gates/gateStore";
import type { GateRecord } from "@/lib/gates/gateTypes";
import {
  getPlServerSharedCompanies,
  readPlServerGatePreviewContext,
  shouldFetchPlServerAccessContext,
} from "@/lib/plServerAccessContext";
import { isCompanyAllowedOnActiveServerGate } from "@/lib/plServerRemoteCompanyLogin";
import { isPlServerSharedCompanyRow } from "@/lib/plServerAccessContext";
import { isElectronDesktopApp } from "@/lib/isElectronDesktop";
import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";
import { plServerVoucherForensicTrace } from "@/lib/plServerLiveChangeTrace";

/** Live pull tracing — dev + packaged EXE/APK (public web production me band). */
function livePullLoggingEnabled(): boolean {
  if (process.env.NODE_ENV === "development") return true;
  return isElectronDesktopApp() || isCapacitorNativeApp();
}

/** Routine OK path — quiet in EXE/dev so real bugs stay visible. */
const LIVE_PULL_ROUTINE_OK = new Set([
  "component_mounted",
  "component_unmounted",
  "effect_run",
  "scheduler_started",
  "scheduler_stopped",
  "scheduler_not_started",
  "scheduler_epoch_bump",
  "poll_started",
  "poll_finished",
  "pull_finished",
  "pull_path_select",
  "focus_collection_updated",
  "browser_db_updated",
  "route_pull_finished",
  "access_context_refresh_before_pull",
  "vouchers_received",
]);

export function livePullDevLog(message: string, detail?: Record<string, unknown>): void {
  if (!livePullLoggingEnabled()) return;
  if (LIVE_PULL_ROUTINE_OK.has(message)) {
    if (detail?.ok === false) {
      /* still log failed pulls */
    } else if (message === "focus_collection_updated" && Number(detail?.upserted || 0) > 0) {
      /* real writes */
    } else if (message === "browser_db_updated" && Number(detail?.upserted || 0) > 0) {
      /* real writes */
    } else if (
      message === "scheduler_not_started" &&
      detail?.reason &&
      detail.reason !== "no_company_id" &&
      detail.reason !== "hub_origin_no_live_sync"
    ) {
      /* unexpected blockers */
    } else {
      return;
    }
  }
  if (detail && Object.keys(detail).length > 0) {
    console.log(`[LivePull] ${message}`, detail);
    return;
  }
  console.log(`[LivePull] ${message}`);
}

/** Voucher-only PLServer flow: filter this label when server-added voucher does not reach user UI. */
export function plServerVoucherFlowLog(message: string, detail?: Record<string, unknown>): void {
  if (!livePullLoggingEnabled()) return;
  if (detail && Object.keys(detail).length > 0) {
    console.log(`[PlServerVoucherFlow] ${message}`, detail);
    return;
  }
  console.log(`[PlServerVoucherFlow] ${message}`);
}

/** Operator / dev bug catch — failures with actionable root-cause codes (EXE + dev). */
export function livePullBugCatch(
  code: string,
  detail: Record<string, unknown> & { companyId?: string }
): void {
  if (!livePullLoggingEnabled()) return;
  console.warn(`[LivePullBug] ${code}`, {
    at: new Date().toISOString(),
    ...detail,
  });
}

/** Per-doc merge skip — EXE + dev (public web production me band). */
export function mirrorMergeSkipLog(detail: Record<string, unknown>): void {
  if (!livePullLoggingEnabled()) return;
  // Benign: remote == local — not an error; floods console on every light poll.
  if (detail.reason === "timestamp_equal_same_payload") return;
  console.log("[DeltaMergeSkip]", { at: new Date().toISOString(), ...detail });
  if (detail.collection === "vouchers") {
    plServerVoucherForensicTrace("client_voucher_merge_skipped", detail);
  }
}

export function mirrorMergeApplyLog(detail: Record<string, unknown>): void {
  if (!livePullLoggingEnabled()) return;
  console.log("[DeltaMergeApply]", { at: new Date().toISOString(), ...detail });
}

/** Server-side party/master timestamp lifecycle — verify edit → SQLite → export (merge policy change se pehle). */
export function serverTimestampTraceLog(phase: string, detail: Record<string, unknown>): void {
  if (!livePullLoggingEnabled()) return;
  console.log(`[ServerTimestampTrace] ${phase}`, detail);
}

export type LivePullSchedulerSnapshot = {
  companyId: string;
  companyPlServerShared: boolean;
  storageOption: string | null;
  activeGateId: string;
  activeGateType: string;
  gateHasServerUrl: boolean;
  gateConnected: boolean;
  localAuthTokenPresent: boolean;
  accessContextEnabled: boolean;
  gateCompanyAllowed: boolean;
  isServerRow: boolean;
  canSync: boolean;
  sharedCompaniesCount: number;
  gatePreviewCompaniesCount: number;
  blockers: {
    noCompanyId?: boolean;
    accessContextFalse?: boolean;
    noGate?: boolean;
    gateNotLocalServer?: boolean;
    gateNoServerUrl?: boolean;
    gateNotAllowed?: boolean;
    companySharedFalse?: boolean;
  };
};

/** Snapshot scheduler inputs at effect-run time — diagnose stale deps / early exit. */
export function buildLivePullSchedulerSnapshot(
  companyId: string | null | undefined,
  company:
    | {
        id?: string;
        plServerShared?: boolean;
        storageOption?: string;
        syncedFromCloud?: boolean;
        plServerGateId?: string;
        plServerGateServerUrl?: string;
        plServerHostCompanyId?: string;
      }
    | null
    | undefined
): LivePullSchedulerSnapshot {
  const id = String(companyId || "").trim();
  const gate: GateRecord = getActiveGate();
  const localAuthTokenPresent = Boolean(id && getLocalAuthToken(id));
  const gateHasServerUrl = gate.type === "local_server" && Boolean(String(gate.serverUrl || "").trim());
  const rowHasServerUrl = Boolean(String(company?.plServerGateServerUrl || "").trim());
  const gateConnected = gateHasServerUrl;
  const storageIsLocal = String(company?.storageOption ?? "").toLowerCase().trim() === "local";
  const rowLooksServerGate =
    company?.plServerShared === true ||
    Boolean(String(company?.plServerGateServerUrl || "").trim()) ||
    Boolean(String(company?.plServerHostCompanyId || "").trim()) ||
    (gate.type === "local_server" && storageIsLocal);
  const accessContextEnabled = shouldFetchPlServerAccessContext() || rowLooksServerGate;
  const gateCompanyAllowed = Boolean(
    id && (isCompanyAllowedOnActiveServerGate(id, gate) || (gate.type === "local_server" && rowLooksServerGate))
  );
  const gatePathOk =
    gate.type === "local_server" && Boolean(gate.serverUrl) && gateCompanyAllowed;
  const canSync =
    localAuthTokenPresent ||
    gatePathOk ||
    Boolean((gateHasServerUrl || rowHasServerUrl) && rowLooksServerGate);
  const localServerAuthenticatedCompany =
    gate.type === "local_server" &&
    localAuthTokenPresent &&
    String(company?.storageOption ?? "").toLowerCase().trim() === "local";
  const isServerRow =
    company?.plServerShared === true ||
    isPlServerSharedCompanyRow(id ? { ...company, id } : company, gate.id) ||
    (Boolean(id) && isPlServerSharedCompanyRow({ id }, gate.id)) ||
    localServerAuthenticatedCompany ||
    Boolean((gateHasServerUrl || rowHasServerUrl) && rowLooksServerGate);
  const preview = readPlServerGatePreviewContext(gate.id);
  const blockers: LivePullSchedulerSnapshot["blockers"] = {};
  if (!id) blockers.noCompanyId = true;
  if (!accessContextEnabled) blockers.accessContextFalse = true;
  if (!canSync) {
    if (rowHasServerUrl) {
      // Saved server URL on the company row is enough; active gate may be Online/Device in another tab.
    } else if (gate.type !== "local_server") {
      blockers.gateNotLocalServer = true;
      blockers.noGate = true;
    } else if (!gate.serverUrl) {
      blockers.gateNoServerUrl = true;
      blockers.noGate = true;
    } else if (!gateCompanyAllowed) {
      blockers.gateNotAllowed = true;
    }
  }
  if (id && accessContextEnabled && canSync && !isServerRow) {
    blockers.companySharedFalse = true;
  }
  return {
    companyId: id,
    companyPlServerShared: company?.plServerShared === true,
    storageOption: company?.storageOption ?? null,
    activeGateId: gate.id,
    activeGateType: gate.type,
    gateHasServerUrl,
    gateConnected,
    localAuthTokenPresent,
    accessContextEnabled,
    gateCompanyAllowed,
    isServerRow,
    canSync,
    sharedCompaniesCount: getPlServerSharedCompanies().length,
    gatePreviewCompaniesCount: preview.companies.length,
    blockers,
  };
}
