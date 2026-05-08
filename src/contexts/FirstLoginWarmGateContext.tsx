"use client";

/**
 * Pehli-login full warm overlay chal raha ho to `OfflineWarmSyncManager` embedded/debounced warm skip —
 * do baar poora pull + attachment prefetch na ho.
 */
import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

type Ctx = {
  gateActive: boolean;
  setGateActive: (v: boolean) => void;
};

const FirstLoginWarmGateContext = createContext<Ctx | null>(null);

export function FirstLoginWarmGateProvider({ children }: { children: React.ReactNode }) {
  const [gateActive, setGateActiveState] = useState(false);
  const setGateActive = useCallback((v: boolean) => {
    setGateActiveState(v);
  }, []);
  const value = useMemo(() => ({ gateActive, setGateActive }), [gateActive, setGateActive]);
  return (
    <FirstLoginWarmGateContext.Provider value={value}>{children}</FirstLoginWarmGateContext.Provider>
  );
}

export function useFirstLoginWarmGate(): Ctx {
  const c = useContext(FirstLoginWarmGateContext);
  if (!c) {
    return { gateActive: false, setGateActive: () => {} };
  }
  return c;
}
