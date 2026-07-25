export type GateType = "device" | "online" | "local_server";

export type GateStatus = "unknown" | "online" | "offline" | "error";

export type GateRecord = {
  id: string;
  type: GateType;
  /** User label — e.g. "Office PC", "This phone" */
  label: string;
  /** local_server only — http://192.168.1.5:3000 */
  serverUrl?: string;
  /** local_server only — from server owner */
  accessToken?: string; // Legacy only; PLServer gates are token-free.
  createdAtMs: number;
  lastTestedAtMs?: number;
  lastStatus?: GateStatus;
  lastError?: string;
};

export const PL_GATE_CHANGED_EVENT = "pl-gate-changed";

export const GATE_STORAGE_KEY = "pl_gates_v1";
export const ACTIVE_GATE_STORAGE_KEY = "pl_active_gate_id_v1";

export const BUILTIN_DEVICE_GATE_ID = "gate_device";
export const BUILTIN_ONLINE_GATE_ID = "gate_online";
