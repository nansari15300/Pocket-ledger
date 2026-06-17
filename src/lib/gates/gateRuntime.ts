"use client";

import type { Company } from "@/hooks/useCompany";
import {
  DATA_SOURCE_MODE_STORAGE_KEY,
  type DataSourceMode,
} from "@/lib/dataSourceModeDefaults";
import {
  BUILTIN_ONLINE_GATE_ID,
  PL_GATE_CHANGED_EVENT,
  type GateRecord,
} from "@/lib/gates/gateTypes";
import { getActiveGate, writeActiveGateId } from "@/lib/gates/gateStore";

const LOCAL_API_BASE_KEY = "localApiBaseUrl";

export function dispatchGateChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(PL_GATE_CHANGED_EVENT));
}

function setDataSourceMode(mode: DataSourceMode): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(DATA_SOURCE_MODE_STORAGE_KEY, mode);
}

/** Apply active gate to runtime — online-only: Firebase data source. */
export function applyActiveGateRuntime(gate: GateRecord): void {
  void gate;
  if (typeof window === "undefined") return;
  setDataSourceMode("firebase");
  try {
    localStorage.removeItem(LOCAL_API_BASE_KEY);
  } catch {
    /* ignore */
  }
  dispatchGateChanged();
}

export function activateGate(gateId: string): GateRecord {
  void gateId;
  writeActiveGateId(BUILTIN_ONLINE_GATE_ID);
  const gate = getActiveGate();
  applyActiveGateRuntime(gate);
  return gate;
}

export async function refreshActiveLocalServerGateContext(gate: GateRecord): Promise<null> {
  void gate;
  return null;
}

export function navigateToLocalServerGate(gate: GateRecord, companyId?: string): void {
  void gate;
  void companyId;
}

export function navigateToBundledDeviceGate(): void {
  activateGate(BUILTIN_ONLINE_GATE_ID);
  if (typeof window !== "undefined") {
    window.location.href = "/";
  }
}

export function isDeviceGate(_gate: GateRecord): boolean {
  return false;
}

export function isOnlineGate(gate: GateRecord): boolean {
  return gate.type === "online" || gate.id === BUILTIN_ONLINE_GATE_ID;
}

export function isLocalServerGate(_gate: GateRecord): boolean {
  return false;
}

/** Filter company list for active gate — online-only: visible companies only. */
export function filterCompaniesForActiveGate(companies: Company[], gate: GateRecord): Company[] {
  void gate;
  return companies.filter((c) => c.isDeleted !== true && c.movedToAdminRecycleAt == null);
}

export function pickGateAwareAutoSelectCompanyId(companies: Company[], gate?: GateRecord): string | null {
  if (!companies.length) return null;
  const sorted = [...companies].sort((a, b) => {
    const nameCmp = String(a.name || "").localeCompare(String(b.name || ""), undefined, {
      sensitivity: "base",
    });
    if (nameCmp !== 0) return nameCmp;
    return String(a.id || "").localeCompare(String(b.id || ""));
  });
  void gate;
  return sorted[0]!.id;
}

export function activeGateAllowsCompanyCreate(_gate: GateRecord): boolean {
  return true;
}

export function activeGateCreateHint(_gate: GateRecord): string {
  return "New companies save to your online account (Firebase).";
}
