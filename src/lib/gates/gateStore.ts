"use client";

import {
  ACTIVE_GATE_STORAGE_KEY,
  BUILTIN_DEVICE_GATE_ID,
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
  return [
    {
      id: BUILTIN_DEVICE_GATE_ID,
      type: "device",
      label: "This device",
      createdAtMs: t,
    },
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
  const existing = readRawGates();
  const byId = new Map(existing.map((g) => [g.id, g]));
  for (const def of buildDefaultGates()) {
    if (!byId.has(def.id)) byId.set(def.id, def);
  }
  let needsPersist = false;
  const merged = [...byId.values()]
    .map((g) => {
      if (g.type !== "local_server" || !g.serverUrl) return g;
      const serverUrl = normalizeServerUrl(g.serverUrl);
      if (serverUrl && serverUrl !== g.serverUrl) {
        needsPersist = true;
        return { ...g, serverUrl };
      }
      return g;
    })
    .sort((a, b) => a.createdAtMs - b.createdAtMs);
  if (needsPersist) writeRawGates(merged);
  return merged;
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
  const id = readActiveGateId();
  const found = id ? gates.find((g) => g.id === id) : null;
  const fallbackId = defaultBuiltinGateId();
  return found ?? gates.find((g) => g.id === fallbackId) ?? gates[0]!;
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
  const label = input.label.trim() || "Local server";
  const serverUrl = normalizeServerUrl(input.serverUrl);
  const accessToken = input.accessToken.trim();
  if (!serverUrl) throw new Error("Enter a valid server address (IP or URL).");
  if (!accessToken) throw new Error("Access token is required.");

  const gate: GateRecord = {
    id: newLocalGateId(),
    type: "local_server",
    label,
    serverUrl,
    accessToken,
    createdAtMs: nowMs(),
  };
  const gates = listGates();
  writeRawGates([...gates, gate]);
  return gate;
}

export function updateLocalServerGate(
  id: string,
  input: { label: string; serverUrl: string; accessToken?: string }
): GateRecord {
  const prev = getGateById(id);
  if (!prev || prev.type !== "local_server") {
    throw new Error("Gate not found or not editable.");
  }
  const label = input.label.trim() || prev.label;
  const serverUrl = normalizeServerUrl(input.serverUrl);
  if (!serverUrl) throw new Error("Enter a valid server address (IP or URL).");

  const token = input.accessToken?.trim();
  const patch: Partial<Pick<GateRecord, "label" | "serverUrl" | "accessToken" | "lastStatus" | "lastError">> = {
    label,
    serverUrl,
  };
  if (token) patch.accessToken = token;
  if (serverUrl !== prev.serverUrl || token) {
    patch.lastStatus = "unknown";
    patch.lastError = undefined;
  }

  const next = updateGate(id, patch);
  if (!next) throw new Error("Could not update gate.");
  return next;
}

export function updateGate(id: string, patch: Partial<Pick<GateRecord, "label" | "serverUrl" | "accessToken" | "lastStatus" | "lastError" | "lastTestedAtMs">>): GateRecord | null {
  const gates = listGates();
  const idx = gates.findIndex((g) => g.id === id);
  if (idx < 0) return null;
  const prev = gates[idx]!;
  if (prev.type === "device" || prev.type === "online") {
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
  if (id === BUILTIN_DEVICE_GATE_ID || id === BUILTIN_ONLINE_GATE_ID) return false;
  const gates = listGates().filter((g) => g.id !== id);
  writeRawGates(gates);
  if (readActiveGateId() === id) {
    writeActiveGateId(BUILTIN_DEVICE_GATE_ID);
  }
  return true;
}

export function gateTypeLabel(type: GateType): string {
  switch (type) {
    case "device":
      return "Device";
    case "online":
      return "Online";
    case "local_server":
      return "Local server";
    default:
      return type;
  }
}

/** Sidebar: active gate type next to “Gate” nav item. */
export function gateSidebarTypeLabel(type: GateType): string {
  switch (type) {
    case "device":
      return "Local";
    case "online":
      return "Online";
    case "local_server":
      return "Local server";
    default:
      return "";
  }
}
