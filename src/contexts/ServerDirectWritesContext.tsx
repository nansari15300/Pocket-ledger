"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  readServerDirectWritesPreferredSync,
  writeServerDirectWritesPreferred,
  PL_SERVER_DIRECT_WRITES_CHANGED_EVENT,
  PL_SERVER_DIRECT_WRITES_KEY,
} from "@/lib/serverDirectWritesPreference";

type ServerDirectWritesContextValue = {
  /** ON = Firestore direct writes (static/APK policy); OFF = local SQLite-first writes */
  directServerWrites: boolean;
  setDirectServerWrites: (v: boolean) => void;
};

const ServerDirectWritesContext = createContext<ServerDirectWritesContextValue | null>(null);

export function ServerDirectWritesProvider({ children }: { children: React.ReactNode }) {
  const [directServerWrites, setState] = useState(false);

  useEffect(() => {
    setState(readServerDirectWritesPreferredSync());
  }, []);

  const setDirectServerWrites = useCallback((v: boolean) => {
    writeServerDirectWritesPreferred(v);
    setState(v);
  }, []);

  useEffect(() => {
    const sync = () => setState(readServerDirectWritesPreferredSync());
    window.addEventListener(PL_SERVER_DIRECT_WRITES_CHANGED_EVENT, sync as EventListener);
    const onStorage = (e: StorageEvent) => {
      if (e.key === PL_SERVER_DIRECT_WRITES_KEY || e.key === null) sync();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(PL_SERVER_DIRECT_WRITES_CHANGED_EVENT, sync as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const value = useMemo(
    () => ({ directServerWrites, setDirectServerWrites }),
    [directServerWrites, setDirectServerWrites]
  );

  return <ServerDirectWritesContext.Provider value={value}>{children}</ServerDirectWritesContext.Provider>;
}

export function useServerDirectWrites(): ServerDirectWritesContextValue {
  const ctx = useContext(ServerDirectWritesContext);
  if (!ctx) {
    return {
      directServerWrites: readServerDirectWritesPreferredSync(),
      setDirectServerWrites: writeServerDirectWritesPreferred,
    };
  }
  return ctx;
}
