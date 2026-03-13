"use client";

import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";

export type SyncToOption = "firestore" | "drive" | "dropbox";

const STORAGE_SYNC_ON = "onlineSyncOn";
const STORAGE_SYNC_TO = "syncTo";
const STORAGE_LAST_SYNC_AT = "lastSyncAt";

type SyncContextType = {
  onlineSyncOn: boolean;
  syncTo: SyncToOption;
  lastSyncAt: number | null;
  setOnlineSyncOn: (on: boolean) => void;
  setSyncTo: (to: SyncToOption) => void;
  setLastSyncAt: (ts: number | null) => void;
};

const SyncContext = createContext<SyncContextType | undefined>(undefined);

function readStored(): { onlineSyncOn: boolean; syncTo: SyncToOption; lastSyncAt: number | null } {
  if (typeof window === "undefined") {
    return { onlineSyncOn: false, syncTo: "firestore", lastSyncAt: null };
  }
  const on = localStorage.getItem(STORAGE_SYNC_ON);
  const to = localStorage.getItem(STORAGE_SYNC_TO) as SyncToOption | null;
  const ts = localStorage.getItem(STORAGE_LAST_SYNC_AT);
  return {
    onlineSyncOn: on === "true",
    syncTo: to === "drive" || to === "dropbox" ? to : "firestore",
    lastSyncAt: ts ? parseInt(ts, 10) : null,
  };
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const [onlineSyncOn, setOnlineSyncOnState] = useState(false);
  const [syncTo, setSyncToState] = useState<SyncToOption>("firestore");
  const [lastSyncAt, setLastSyncAtState] = useState<number | null>(null);

  useEffect(() => {
    const s = readStored();
    setOnlineSyncOnState(s.onlineSyncOn);
    setSyncToState(s.syncTo);
    setLastSyncAtState(s.lastSyncAt);
  }, []);

  const setOnlineSyncOn = useCallback((on: boolean) => {
    setOnlineSyncOnState(on);
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_SYNC_ON, String(on));
  }, []);

  const setSyncTo = useCallback((to: SyncToOption) => {
    setSyncToState(to);
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_SYNC_TO, to);
  }, []);

  const setLastSyncAt = useCallback((ts: number | null) => {
    setLastSyncAtState(ts);
    if (typeof window !== "undefined") {
      if (ts == null) localStorage.removeItem(STORAGE_LAST_SYNC_AT);
      else localStorage.setItem(STORAGE_LAST_SYNC_AT, String(ts));
    }
  }, []);

  return (
    <SyncContext.Provider
      value={{
        onlineSyncOn,
        syncTo,
        lastSyncAt,
        setOnlineSyncOn,
        setSyncTo,
        setLastSyncAt,
      }}
    >
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  const ctx = useContext(SyncContext);
  if (ctx === undefined) {
    throw new Error("useSync must be used within SyncProvider");
  }
  return ctx;
}
