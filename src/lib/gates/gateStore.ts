"use client";

import {
  ACTIVE_GATE_STORAGE_KEY,
  BUILTIN_ONLINE_GATE_ID,
  GATE_STORAGE_KEY,
  type GateRecord,
  type GateType,
} from "@/lib/gates/gateTypes";
import { defaultBuiltinGateId } from "@/lib/gates/gateClientKind";

function nowMs(): number {
  return Date.now();
}

function readRawGates(): GateRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(GATE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((g): g is GateRecord => !!g && typeof g === "object" && typeof (g as GateRecord).id === "string");
  } catch {
    return [];
  }
}

function writeRawGates(gates: GateRecord[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(GATE_STORAGE_KEY, JSON.stringify(gates));
}

export function buildDefaultGates(): GateRecord[] {
  const t = nowMs();
  // Online-only app mode: keep a single built-in Online gate and drop legacy device/local gates.
  return [
    {
      id: BUILTIN_ONLINE_GATE_ID,
      type: "online",
      label: "Online",
      createdAtMs: t,
    },
  ];
}

/** Ensure built-in device + online gates exist; migrate empty store. */
export function ensureDefaultGates(): GateRecord[] {
  const onlineOnly = buildDefaultGates();
  // Persist online-only registry so stale local/server gates are fully removed from storage.
  writeRawGates(onlineOnly);
  if (readActiveGateId() !== BUILTIN_ONLINE_GATE_ID) {
    writeActiveGateId(BUILTIN_ONLINE_GATE_ID);
  }
  return onlineOnly;
}

export function listGates(): GateRecord[] {
  return ensureDefaultGates();
}

export function getGateById(id: string): GateRecord | null {
  return listGates().find((g) => g.id === id) ?? null;
}

export function readActiveGateId(): string | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(ACTIVE_GATE_STORAGE_KEY);
  return raw?.trim() || null;
}

export function writeActiveGateId(id: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACTIVE_GATE_STORAGE_KEY, id);
}

export function getActiveGate(): GateRecord {
  const gates = listGates();
  // Online-only app mode: always resolve active gate to Online.
  return gates.find((g) => g.id === BUILTIN_ONLINE_GATE_ID) ?? gates[0]!;
}

function newLocalGateId(): string {
  return `gate_local_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeServerUrl(raw: string): string {
  let trimmed = raw.trim().replace(/\)+$/g, "");
  if (!trimmed) return "";
  const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  try {
    const u = new URL(withProto);
    let pathname = u.pathname.replace(/\/+$/, "") || "";
    const suffix = "/__pl_access_context";
    if (pathname.toLowerCase().endsWith(suffix)) {
      pathname = pathname.slice(0, -suffix.length);
    }
    u.pathname = pathname;
    u.search = "";
    u.hash = "";
    const out = u.toString().replace(/\/$/, "");
    return out.endsWith(":/") ? out.slice(0, -1) : out;
  } catch {
    return "";
  }
}

export function addLocalServerGate(input: {
  label: string;
  serverUrl: string;
  accessToken: string;
}): GateRecord {
  // Keep API signature stable but hard-disable local server gate creation in online-only mode.
  void input;
  throw new Error("Local server gate is removed. App is online-only.");
}

export function updateLocalServerGate(
  id: string,
  input: { label: string; serverUrl: string; accessToken?: string }
): GateRecord {
  // Keep API signature stable but hard-disable local server gate updates in online-only mode.
  void id;
  void input;
  throw new Error("Local server gate is removed. App is online-only.");
}

export function updateGate(id: string, patch: Partial<Pick<GateRecord, "label" | "serverUrl" | "accessToken" | "lastStatus" | "lastError" | "lastTestedAtMs">>): GateRecord | null {
  const gates = listGates();
  const idx = gates.findIndex((g) => g.id === id);
  if (idx < 0) return null;
  const prev = gates[idx]!;
  if (prev.type === "online") {
    if (patch.label) {
      gates[idx] = { ...prev, label: patch.label.trim() || prev.label };
      writeRawGates(gates);
      return gates[idx]!;
    }
    return prev;
  }
  const next: GateRecord = {
    ...prev,
    ...(patch.label != null ? { label: patch.label.trim() || prev.label } : {}),
    ...(patch.serverUrl != null ? { serverUrl: normalizeServerUrl(patch.serverUrl) || prev.serverUrl } : {}),
    ...(patch.accessToken != null ? { accessToken: patch.accessToken.trim() || prev.accessToken } : {}),
    ...(patch.lastStatus != null ? { lastStatus: patch.lastStatus } : {}),
    ...(patch.lastError != null ? { lastError: patch.lastError } : {}),
    ...(patch.lastTestedAtMs != null ? { lastTestedAtMs: patch.lastTestedAtMs } : {}),
  };
  gates[idx] = next;
  writeRawGates(gates);
  return next;
}

export function deleteGate(id: string): boolean {
  // Online-only app mode: no deletable gate exists.
  void id;
  return false;
}

export function gateTypeLabel(type: GateType): string {
  switch (type) {
    case "online":
      return "Online";
    default:
      // Online-only UX copy for legacy type values.
      return "Online";
  }
}

/** Sidebar: active gate type next to “Gate” nav item. */
export function gateSidebarTypeLabel(type: GateType): string {
  switch (type) {
    case "online":
      return "Online";
    default:
      // Online-only UX copy for legacy type values.
      return "";
  }
}
