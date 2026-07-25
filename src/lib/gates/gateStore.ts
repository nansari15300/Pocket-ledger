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

/** Session-only HTTP origin for a gate (user-entered URL display mat badlo). */
const PL_GATE_TRANSPORT_SESSION_KEY = "pl_gate_transport_by_id";

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

/** Ensure built-in device + online gates exist; migrate empty store; same-URL local servers → 1 latest. */
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

  const deduped = dedupeLocalServerGatesKeepingLatest(merged);
  if (deduped.length !== merged.length || needsPersist) {
    writeRawGates(deduped);
    return deduped;
  }
  if (needsPersist) writeRawGates(merged);
  return merged;
}

/**
 * Share message baar-baar aaye to same `serverUrl` pe kai gates ban jate hain.
 * UI + storage: ek URL = ek gate (active prefer, warna latest `createdAtMs`).
 */
export function dedupeLocalServerGatesKeepingLatest(gates: GateRecord[]): GateRecord[] {
  const builtins = gates.filter((g) => g.type !== "local_server");
  const locals = gates.filter((g) => g.type === "local_server");
  if (locals.length <= 1) return gates;

  const activeId = readActiveGateId();
  const groups = new Map<string, GateRecord[]>();
  for (const g of locals) {
    const key = normalizeServerUrl(g.serverUrl || "") || `id:${g.id}`;
    const arr = groups.get(key) || [];
    arr.push(g);
    groups.set(key, arr);
  }

  const keptLocals: GateRecord[] = [];
  let changed = false;
  for (const [, group] of groups) {
    if (group.length === 1) {
      keptLocals.push(group[0]!);
      continue;
    }
    changed = true;
    const sorted = [...group].sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
    const latest = sorted[0]!;
    const active = group.find((g) => g.id === activeId);
    const winnerBase = active || latest;
    // Latest label/status absorb karo (naya share message); PLServer gates are token-free.
    const winner: GateRecord = {
      ...winnerBase,
      label: latest.label || winnerBase.label,
      serverUrl: normalizeServerUrl(latest.serverUrl || winnerBase.serverUrl || "") || winnerBase.serverUrl,
      accessToken: "",
      createdAtMs: Math.max(...group.map((g) => g.createdAtMs || 0)),
      lastStatus: latest.lastStatus ?? winnerBase.lastStatus,
      lastError: latest.lastError ?? winnerBase.lastError,
      lastTestedAtMs: latest.lastTestedAtMs ?? winnerBase.lastTestedAtMs,
    };
    keptLocals.push(winner);
  }

  if (!changed) return gates;

  const out = [...builtins, ...keptLocals].sort((a, b) => a.createdAtMs - b.createdAtMs);
  const activeStillThere = out.some((g) => g.id === activeId);
  if (activeId && !activeStillThere) {
    const urlOfActive = normalizeServerUrl(
      locals.find((g) => g.id === activeId)?.serverUrl || ""
    );
    const replacement =
      (urlOfActive &&
        keptLocals.find((g) => normalizeServerUrl(g.serverUrl || "") === urlOfActive)) ||
      keptLocals[0];
    if (replacement) writeActiveGateId(replacement.id);
  }
  return out;
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

export function writeGateTransportUrl(gateId: string, transportUrl: string | null | undefined): void {
  if (typeof window === "undefined") return;
  const id = String(gateId || "").trim();
  if (!id) return;
  try {
    const raw = sessionStorage.getItem(PL_GATE_TRANSPORT_SESSION_KEY);
    const map: Record<string, string> = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    const norm = transportUrl ? normalizeServerUrl(transportUrl) : "";
    if (norm) map[id] = norm;
    else delete map[id];
    sessionStorage.setItem(PL_GATE_TRANSPORT_SESSION_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function readGateTransportUrl(gateId: string): string {
  if (typeof window === "undefined") return "";
  const id = String(gateId || "").trim();
  if (!id) return "";
  try {
    const raw = sessionStorage.getItem(PL_GATE_TRANSPORT_SESSION_KEY);
    const map: Record<string, string> = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    return normalizeServerUrl(map[id] || "");
  } catch {
    return "";
  }
}

/** HTTP / delta sync — user gate URL ya session transport override. */
export function resolveGateServerTransportUrl(gate: GateRecord): string {
  if (gate.type !== "local_server") return "";
  const transport = readGateTransportUrl(gate.id);
  if (transport) return transport;
  return normalizeServerUrl(gate.serverUrl || "");
}

export function normalizeServerUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\)+$/g, "");
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
  accessToken?: string;
}): GateRecord {
  const label = input.label.trim() || "Local server";
  const serverUrl = normalizeServerUrl(input.serverUrl);
  if (!serverUrl) throw new Error("Enter a valid server address (IP or URL).");
  // PLServer gates are token-free; keep the field only to clear legacy saved values.

  const gates = listGates();
  const sameUrl = gates.filter(
    (g) => g.type === "local_server" && normalizeServerUrl(g.serverUrl || "") === serverUrl
  );
  if (sameUrl.length > 0) {
    const activeId = readActiveGateId();
    const sorted = [...sameUrl].sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
    const keep = sameUrl.find((g) => g.id === activeId) || sorted[0]!;
    const next: GateRecord = {
      ...keep,
      label,
      serverUrl,
      accessToken: "",
      createdAtMs: Math.max(keep.createdAtMs || 0, nowMs()),
      lastStatus: "unknown",
      lastError: undefined,
    };
    const withoutDupes = gates.filter(
      (g) =>
        g.id === keep.id ||
        g.type !== "local_server" ||
        normalizeServerUrl(g.serverUrl || "") !== serverUrl
    );
    const idx = withoutDupes.findIndex((g) => g.id === keep.id);
    if (idx >= 0) withoutDupes[idx] = next;
    else withoutDupes.push(next);
    writeRawGates(withoutDupes);
    return next;
  }

  const gate: GateRecord = {
    id: newLocalGateId(),
    type: "local_server",
    label,
    serverUrl,
    accessToken: "",
    createdAtMs: nowMs(),
  };
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

  const patch: Partial<Pick<GateRecord, "label" | "serverUrl" | "accessToken" | "lastStatus" | "lastError">> = {
    label,
    serverUrl,
    accessToken: "",
  };
  if (serverUrl !== prev.serverUrl || (prev.accessToken || "").trim()) {
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
    ...(patch.accessToken != null || (prev.accessToken || "").trim() ? { accessToken: "" } : {}),
    ...(patch.lastStatus != null ? { lastStatus: patch.lastStatus } : {}),
    ...(patch.lastError != null ? { lastError: patch.lastError } : {}),
    ...(patch.lastTestedAtMs != null ? { lastTestedAtMs: patch.lastTestedAtMs } : {}),
  };
  gates[idx] = next;
  writeRawGates(gates);
  return next;
}

/**
 * Sharing port (`:3001`) / hub Open gate landing — is origin ke localStorage me gate save + active.
 * Web / EXE / APK: 3000 vs 3001 alag origin hote hain, isliye URL se gate dubara hydrate karna padta hai.
 */
export function ensureSharingPortLocalServerGate(input?: {
  id?: string | null;
  label?: string | null;
  serverUrl?: string | null;
}): GateRecord | null {
  if (typeof window === "undefined") return null;
  const serverUrl = normalizeServerUrl(
    String(input?.serverUrl || "").trim() || window.location.origin
  );
  if (!serverUrl) return null;

  const gates = ensureDefaultGates();
  const existingByUrl = gates.find(
    (g) => g.type === "local_server" && normalizeServerUrl(g.serverUrl || "") === serverUrl
  );

  const id = String(input?.id || existingByUrl?.id || `pl_server_url:${serverUrl}`).trim();
  if (!id) return null;

  const label =
    String(input?.label || existingByUrl?.label || "Local server").trim() || "Local server";

  const gate = ensureLocalServerGateFromRemoteLanding({ id, label, serverUrl });
  if (gate) writeActiveGateId(gate.id);
  return gate;
}

/** Remote `/gate` landing (`:3001`): hub se aaya gate id + label yahan persist. */
export function ensureLocalServerGateFromRemoteLanding(input: {
  id: string;
  label?: string | null;
  serverUrl?: string | null;
}): GateRecord | null {
  const id = String(input.id || "").trim();
  if (!id) return null;
  const serverUrl = normalizeServerUrl(
    String(input.serverUrl || "").trim() ||
      (typeof window !== "undefined" ? window.location.origin : "")
  );
  if (!serverUrl) return null;
  const label = String(input.label || "").trim() || "Local server";
  const gates = ensureDefaultGates();
  const existing = gates.find((g) => g.id === id);
  if (existing) {
    return updateGate(id, { label, serverUrl }) ?? existing;
  }
  const gate: GateRecord = {
    id,
    type: "local_server",
    label,
    serverUrl,
    accessToken: "",
    createdAtMs: nowMs(),
  };
  writeRawGates([...gates, gate]);
  return gate;
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
