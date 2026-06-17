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
import { PL_GATE_CHANGED_EVENT, type GateRecord } from "@/lib/gates/gateTypes";
import {
  buildDefaultGates,
  ensureDefaultGates,
  getActiveGate,
  listGates,
  readActiveGateId,
} from "@/lib/gates/gateStore";
import { defaultBuiltinGateId } from "@/lib/gates/gateClientKind";
import {
  activateGate,
  activeGateAllowsCompanyCreate,
  activeGateCreateHint,
  applyActiveGateRuntime,
  filterCompaniesForActiveGate,
  navigateToBundledDeviceGate,
} from "@/lib/gates/gateRuntime";
import { ensureWebDefaultOnlineGate } from "@/lib/gates/gateClientDefaults";

type GateContextValue = {
  gates: GateRecord[];
  activeGate: GateRecord;
  activeGateId: string;
  setActiveGateId: (id: string) => void;
  /** Local server gates removed — stubs keep call sites compiling. */
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

const LOCAL_SERVER_REMOVED_MSG = "Local server gates were removed. This app uses online (Firebase) only.";

export function GateProvider({ children }: { children: ReactNode }) {
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

  const setActiveGateId = useCallback((id: string) => {
    const gate = activateGate(id);
    setActiveGateIdState(gate.id);
    setGates(listGates());
  }, []);

  const value: GateContextValue = {
    gates,
    activeGate,
    activeGateId,
    setActiveGateId,
    addLocalServerGate: () => getActiveGate(),
    updateLocalServerGate: () => getActiveGate(),
    removeGate: () => false,
    renameGate: () => {},
    testLocalServerGate: async () => ({ ok: false, message: LOCAL_SERVER_REMOVED_MSG }),
    connectLocalServerGate: () => {},
    backToDeviceGate: () => {
      navigateToBundledDeviceGate();
      refreshGates();
    },
    filterCompanies: (companies) => filterCompaniesForActiveGate(companies, activeGate),
    canCreateCompanyOnActiveGate: activeGateAllowsCompanyCreate(activeGate),
    activeGateCreateHintText: activeGateCreateHint(activeGate),
    refreshGates,
    selectedGateIdForDetail,
    setSelectedGateIdForDetail,
  };

  return <GateContext.Provider value={value}>{children}</GateContext.Provider>;
}

export function useGate(): GateContextValue {
  const ctx = useContext(GateContext);
  if (!ctx) throw new Error("useGate must be used within GateProvider");
  return ctx;
}
