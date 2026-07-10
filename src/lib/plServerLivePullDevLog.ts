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
import { resolveLocalServerGateAccessToken } from "@/lib/gates/gateRuntime";
import { isElectronDesktopApp } from "@/lib/isElectronDesktop";
import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";

/** Live pull tracing — dev + packaged EXE/APK (public web production me band). */
function livePullLoggingEnabled(): boolean {
  if (process.env.NODE_ENV === "development") return true;
  return isElectronDesktopApp() || isCapacitorNativeApp();
}

export function livePullDevLog(message: string, detail?: Record<string, unknown>): void {
  if (!livePullLoggingEnabled()) return;
  if (detail && Object.keys(detail).length > 0) {
    console.log(`[LivePull] ${message}`, detail);
    return;
  }
  console.log(`[LivePull] ${message}`);
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
  console.log("[MirrorMergeSkip]", detail);
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
  gateHasAccessToken: boolean;
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
    noToken?: boolean;
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
  company: { plServerShared?: boolean; storageOption?: string } | null | undefined
): LivePullSchedulerSnapshot {
  const id = String(companyId || "").trim();
  const gate: GateRecord = getActiveGate();
  const accessContextEnabled = shouldFetchPlServerAccessContext();
  const localAuthTokenPresent = Boolean(id && getLocalAuthToken(id));
  const gateHasServerUrl = gate.type === "local_server" && Boolean(String(gate.serverUrl || "").trim());
  const gateHasAccessToken = gate.type === "local_server" && Boolean(resolveLocalServerGateAccessToken(gate));
  const gateConnected = gateHasServerUrl && gateHasAccessToken;
  const gateCompanyAllowed = Boolean(id && isCompanyAllowedOnActiveServerGate(id, gate));
  const gatePathOk =
    gate.type === "local_server" && Boolean(gate.serverUrl) && gateCompanyAllowed;
  const canSync = localAuthTokenPresent || gatePathOk;
  const isServerRow =
    isPlServerSharedCompanyRow(company, gate.id) ||
    (Boolean(id) && isPlServerSharedCompanyRow({ id }, gate.id));
  const preview = readPlServerGatePreviewContext(gate.id);
  const blockers: LivePullSchedulerSnapshot["blockers"] = {};
  if (!id) blockers.noCompanyId = true;
  if (!accessContextEnabled) blockers.accessContextFalse = true;
  if (!canSync) {
    if (!localAuthTokenPresent) blockers.noToken = true;
    if (gate.type !== "local_server") {
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
    gateHasAccessToken,
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
