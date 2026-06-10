"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Company } from "@/hooks/useCompany";
import {
  PL_GATE_CHANGED_EVENT,
  type GateRecord,
  type GateStatus,
} from "@/lib/gates/gateTypes";
import {
  addLocalServerGate,
  buildDefaultGates,
  deleteGate,
  ensureDefaultGates,
  getActiveGate,
  listGates,
  readActiveGateId,
  updateGate,
  updateLocalServerGate,
  writeActiveGateId,
} from "@/lib/gates/gateStore";
import { defaultBuiltinGateId } from "@/lib/gates/gateClientKind";
import {
  activateGate,
  activeGateAllowsCompanyCreate,
  activeGateCreateHint,
  applyActiveGateRuntime,
  filterCompaniesForActiveGate,
  navigateToBundledDeviceGate,
  navigateToLocalServerGate,
  refreshActiveLocalServerGateContext,
} from "@/lib/gates/gateRuntime";
import { fetchGateServerAccessContext } from "@/lib/gates/gateServerFetch";
import { applyPlServerAccessContextPayload } from "@/lib/plServerAccessContext";
import { ensureWebDefaultOnlineGate } from "@/lib/gates/gateClientDefaults";

type GateContextValue = {
  gates: GateRecord[];
  activeGate: GateRecord;
  activeGateId: string;
  setActiveGateId: (id: string) => void;
  addLocalServerGate: (input: { label: string; serverUrl: string; accessToken: string }) => GateRecord;
  updateLocalServerGate: (
    id: string,
    input: { label: string; serverUrl: string; accessToken?: string }
  ) => GateRecord;
  removeGate: (id: string) => boolean;
  renameGate: (id: string, label: string) => void;
  testLocalServerGate: (id: string) => Promise<{ ok: boolean; message: string }>;
  connectLocalServerGate: (id: string, companyId?: string) => void;
  backToDeviceGate: () => void;
  filterCompanies: (companies: Company[]) => Company[];
  canCreateCompanyOnActiveGate: boolean;
  activeGateCreateHintText: string;
  refreshGates: () => void;
  selectedGateIdForDetail: string | null;
  setSelectedGateIdForDetail: (id: string | null) => void;
};

const GateContext = createContext<GateContextValue | undefined>(undefined);

export function GateProvider({ children }: { children: ReactNode }) {
  // SSR + hydration: localStorage mat padho — server/client pehla paint same ho (web → Online gate).
  const [gates, setGates] = useState<GateRecord[]>(buildDefaultGates);
  const [activeGateId, setActiveGateIdState] = useState<string>(defaultBuiltinGateId);
  const [selectedGateIdForDetail, setSelectedGateIdForDetail] = useState<string | null>(null);

  const refreshGates = useCallback(() => {
    setGates(listGates());
    const id = readActiveGateId() || getActiveGate().id;
    setActiveGateIdState(id);
  }, []);

  useEffect(() => {
    ensureDefaultGates();
    ensureWebDefaultOnlineGate();
    setGates(listGates());
    const gate = getActiveGate();
    setActiveGateIdState(gate.id);
    applyActiveGateRuntime(gate);
    if (gate.type === "local_server") {
      void refreshActiveLocalServerGateContext(gate);
    }
  }, []);

  useEffect(() => {
    const onChange = () => refreshGates();
    window.addEventListener(PL_GATE_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(PL_GATE_CHANGED_EVENT, onChange);
  }, [refreshGates]);

  const activeGate = useMemo(() => {
    const fromList = gates.find((g) => g.id === activeGateId);
    if (fromList) return fromList;
    const defaults = buildDefaultGates();
    return (
      defaults.find((g) => g.id === activeGateId) ??
      defaults.find((g) => g.id === defaultBuiltinGateId()) ??
      defaults[0]!
    );
  }, [gates, activeGateId]);

  const setActiveGateId = useCallback(
    (id: string) => {
      const gate = activateGate(id);
      setActiveGateIdState(gate.id);
      setGates(listGates());
      if (gate.type === "local_server") {
        void refreshActiveLocalServerGateContext(gate);
      }
    },
    []
  );

  const handleAddLocal = useCallback(
    (input: { label: string; serverUrl: string; accessToken: string }) => {
      const gate = addLocalServerGate(input);
      refreshGates();
      return gate;
    },
    [refreshGates]
  );

  const handleUpdateLocal = useCallback(
    (id: string, input: { label: string; serverUrl: string; accessToken?: string }) => {
      const gate = updateLocalServerGate(id, input);
      refreshGates();
      return gate;
    },
    [refreshGates]
  );

  const removeGate = useCallback(
    (id: string) => {
      const ok = deleteGate(id);
      if (ok) refreshGates();
      return ok;
    },
    [refreshGates]
  );

  const renameGate = useCallback(
    (id: string, label: string) => {
      updateGate(id, { label });
      refreshGates();
    },
    [refreshGates]
  );

  const testLocalServerGate = useCallback(async (id: string) => {
    const gate = listGates().find((g) => g.id === id);
    if (!gate || gate.type !== "local_server" || !gate.serverUrl) {
      return { ok: false, message: "Gate not found" };
    }
    const ctx = await fetchGateServerAccessContext(gate.serverUrl, gate.accessToken || "");
    const status: GateStatus = ctx.error ? "error" : "online";
    updateGate(id, {
      lastStatus: status,
      lastError: ctx.error,
      lastTestedAtMs: Date.now(),
    });
    refreshGates();
    if (ctx.error) return { ok: false, message: ctx.error };
    if (gate.accessToken?.trim()) {
      const { persistDevClientAccessToken } = await import("@/lib/plServerAccessContext");
      persistDevClientAccessToken(gate.accessToken.trim());
    }
    applyPlServerAccessContextPayload(
      {
        unrestricted: ctx.unrestricted,
        allowedCompanyIds: ctx.allowedCompanyIds,
        label: ctx.label ?? undefined,
        companies: ctx.companies ?? undefined,
      },
      id
    );
    const count = ctx.unrestricted
      ? "all"
      : String(ctx.companies?.length ?? ctx.allowedCompanyIds?.length ?? 0);
    const label = ctx.label ? ` (${ctx.label})` : "";
    return { ok: true, message: `Connected${label} — ${count} companies allowed` };
  }, [refreshGates]);

  const connectLocalServerGate = useCallback(
    (id: string, companyId?: string) => {
      const gate = listGates().find((g) => g.id === id);
      if (!gate || gate.type !== "local_server") return;
      writeActiveGateId(id);
      setActiveGateIdState(id);
      navigateToLocalServerGate(gate, companyId);
    },
    []
  );

  const backToDeviceGate = useCallback(() => {
    navigateToBundledDeviceGate();
    refreshGates();
  }, [refreshGates]);

  const filterCompanies = useCallback(
    (companies: Company[]) => filterCompaniesForActiveGate(companies, activeGate),
    [activeGate]
  );

  const value: GateContextValue = {
    gates,
    activeGate,
    activeGateId,
    setActiveGateId,
    addLocalServerGate: handleAddLocal,
    updateLocalServerGate: handleUpdateLocal,
    removeGate,
    renameGate,
    testLocalServerGate,
    connectLocalServerGate,
    backToDeviceGate,
    filterCompanies,
    canCreateCompanyOnActiveGate: activeGateAllowsCompanyCreate(activeGate),
    activeGateCreateHintText: activeGateCreateHint(activeGate),
    refreshGates,
    selectedGateIdForDetail,
    setSelectedGateIdForDetail,
  };

  return <GateContext.Provider value={value}>{children}</GateContext.Provider>;
}

export function useGate() {
  const ctx = useContext(GateContext);
  if (!ctx) throw new Error("useGate must be used within GateProvider");
  return ctx;
}
