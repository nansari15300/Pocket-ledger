"use client";

import {
  ACTIVE_GATE_STORAGE_KEY,
  GATE_STORAGE_KEY,
  PL_GATE_CHANGED_EVENT,
  type GateRecord,
} from "@/lib/gates/gateTypes";
import { listGates, readActiveGateId } from "@/lib/gates/gateStore";
import { isElectronDesktopApp } from "@/lib/isElectronDesktop";

export type GateStoreSnapshot = {
  gates: GateRecord[];
  activeGateId: string | null;
};

let applyingRemoteSnapshot = false;

type PlElectronGateCrossTabBridge = {
  publishGateStoreSnapshot?: (snapshot: GateStoreSnapshot) => void;
};

export function readGateStoreSnapshot(): GateStoreSnapshot {
  return {
    gates: listGates(),
    activeGateId: readActiveGateId(),
  };
}

/** Electron main se aaya snapshot — is tab ke localStorage me apply (3000 vs 3001 alag origin). */
export function applyGateStoreSnapshot(snapshot: GateStoreSnapshot | null | undefined): void {
  if (typeof window === "undefined" || !snapshot || applyingRemoteSnapshot) return;
  if (!Array.isArray(snapshot.gates)) return;
  applyingRemoteSnapshot = true;
  try {
    localStorage.setItem(GATE_STORAGE_KEY, JSON.stringify(snapshot.gates));
    const activeId = String(snapshot.activeGateId || "").trim();
    if (activeId) localStorage.setItem(ACTIVE_GATE_STORAGE_KEY, activeId);
    window.dispatchEvent(new Event(PL_GATE_CHANGED_EVENT));
  } finally {
    applyingRemoteSnapshot = false;
  }
}

export function publishGateStoreSnapshotToElectron(): void {
  if (typeof window === "undefined" || applyingRemoteSnapshot) return;
  if (!isElectronDesktopApp()) return;
  try {
    const bridge = (window as Window & { plElectronGate?: PlElectronGateCrossTabBridge }).plElectronGate;
    bridge?.publishGateStoreSnapshot?.(readGateStoreSnapshot());
  } catch {
    /* optional IPC */
  }
}

/** EXE main.js har tab me snapshot inject karta hai — early import par register. */
export function installGateCrossTabSyncHooks(): void {
  if (typeof window === "undefined") return;
  (window as Window & { __plApplyGateStoreSnapshot?: typeof applyGateStoreSnapshot }).__plApplyGateStoreSnapshot =
    applyGateStoreSnapshot;
}
