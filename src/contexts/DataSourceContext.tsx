"use client";

import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";
import {
  type DataSourceMode,
  DATA_SOURCE_MODE_STORAGE_KEY,
  buildDefaultDataSourceMode,
  getEffectiveDataSourceModeFromWindow,
} from "@/lib/dataSourceModeDefaults";

export type { DataSourceMode };

const STORAGE_BASE_URL = "localApiBaseUrl";
/** Default 3001 so it doesn't conflict with Next.js dev server on 3000. */
const DEFAULT_BASE_URL = "http://127.0.0.1:3001";

type DataSourceContextType = {
  mode: DataSourceMode;
  localApiBaseUrl: string;
  setMode: (mode: DataSourceMode) => void;
  setLocalApiBaseUrl: (url: string) => void;
  isLocalMode: boolean;
};

const DataSourceContext = createContext<DataSourceContextType | undefined>(undefined);

function readStored(): { mode: DataSourceMode; localApiBaseUrl: string } {
  if (typeof window === "undefined") {
    return { mode: buildDefaultDataSourceMode(), localApiBaseUrl: DEFAULT_BASE_URL };
  }
  // Web: default Firebase (server); static / LOCAL_ONLY env → default local (`dataSourceModeDefaults`).
  const mode =
    (localStorage.getItem(DATA_SOURCE_MODE_STORAGE_KEY) as DataSourceMode) ||
    buildDefaultDataSourceMode();
  const localApiBaseUrl = localStorage.getItem(STORAGE_BASE_URL) || DEFAULT_BASE_URL;
  return { mode, localApiBaseUrl };
}

export function DataSourceProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<DataSourceMode>(() => {
    if (typeof window === "undefined") return buildDefaultDataSourceMode();
    return getEffectiveDataSourceModeFromWindow();
  });
  const [localApiBaseUrl, setLocalApiBaseUrlState] = useState<string>(() => {
    if (typeof window === "undefined") return DEFAULT_BASE_URL;
    return localStorage.getItem(STORAGE_BASE_URL) || DEFAULT_BASE_URL;
  });

  useEffect(() => {
    const { mode: m, localApiBaseUrl: url } = readStored();
    // Pehli baar: stable mode persist karo taaki `isLocalOnlyMode` / Firestore network same dekhein.
    if (typeof window !== "undefined" && !localStorage.getItem(DATA_SOURCE_MODE_STORAGE_KEY)) {
      localStorage.setItem(DATA_SOURCE_MODE_STORAGE_KEY, m);
    }
    setModeState(m);
    setLocalApiBaseUrlState(url);
  }, []);

  const setMode = useCallback((m: DataSourceMode) => {
    setModeState(m);
    if (typeof window !== "undefined") localStorage.setItem(DATA_SOURCE_MODE_STORAGE_KEY, m);
  }, []);

  const setLocalApiBaseUrl = useCallback((url: string) => {
    setLocalApiBaseUrlState(url);
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_BASE_URL, url);
  }, []);

  const value: DataSourceContextType = {
    mode,
    localApiBaseUrl,
    setMode,
    setLocalApiBaseUrl,
    isLocalMode: mode === "local",
  };

  return (
    <DataSourceContext.Provider value={value}>
      {children}
    </DataSourceContext.Provider>
  );
}

export function useDataSource() {
  const ctx = useContext(DataSourceContext);
  if (ctx === undefined) {
    throw new Error("useDataSource must be used within DataSourceProvider");
  }
  return ctx;
}
