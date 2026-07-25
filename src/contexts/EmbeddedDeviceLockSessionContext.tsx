"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type EmbeddedDeviceLockSessionContextValue = {
  /** Gate unlock ke turant baad heavy boot allow — storage write se pehle bhi. */
  unlockedNow: boolean;
  markUnlockedNow: () => void;
  clearUnlockedNow: () => void;
};

const EmbeddedDeviceLockSessionContext = createContext<EmbeddedDeviceLockSessionContextValue | null>(
  null
);

export function EmbeddedDeviceLockSessionProvider({ children }: { children: ReactNode }) {
  const [unlockedNow, setUnlockedNow] = useState(false);
  const markUnlockedNow = useCallback(() => setUnlockedNow(true), []);
  const clearUnlockedNow = useCallback(() => setUnlockedNow(false), []);
  const value = useMemo(
    () => ({ unlockedNow, markUnlockedNow, clearUnlockedNow }),
    [unlockedNow, markUnlockedNow, clearUnlockedNow]
  );
  return (
    <EmbeddedDeviceLockSessionContext.Provider value={value}>
      {children}
    </EmbeddedDeviceLockSessionContext.Provider>
  );
}

export function useEmbeddedDeviceLockSession(): EmbeddedDeviceLockSessionContextValue {
  const ctx = useContext(EmbeddedDeviceLockSessionContext);
  if (!ctx) {
    return {
      unlockedNow: false,
      markUnlockedNow: () => {},
      clearUnlockedNow: () => {},
    };
  }
  return ctx;
}
