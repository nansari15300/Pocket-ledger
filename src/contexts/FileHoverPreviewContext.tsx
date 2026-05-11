"use client";

import * as React from "react";

/** localStorage key — global file/avatar click preview (AttachmentHoverPortal) ON/OFF; key purana rakha migration ke liye */
const STORAGE_KEY = "pocket-ledger-file-hover-preview-v1";

type FileHoverPreviewContextValue = {
  /** true = attachment/avatar preview ON app-wide — trigger par click (default) */
  enabled: boolean;
  setEnabled: (next: boolean) => void;
  toggle: () => void;
};

const FileHoverPreviewContext = React.createContext<FileHoverPreviewContextValue | null>(null);

export function FileHoverPreviewProvider({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabledState] = React.useState(true);

  // Hydrate from localStorage once (avoid SSR mismatch — first paint default ON)
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === "0" || raw === "false") setEnabledState(false);
      else if (raw === "1" || raw === "true") setEnabledState(true);
    } catch {
      /* ignore */
    }
  }, []);

  const setEnabled = React.useCallback((next: boolean) => {
    setEnabledState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = React.useCallback(() => {
    setEnabledState((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const value = React.useMemo(
    () => ({ enabled, setEnabled, toggle }),
    [enabled, setEnabled, toggle]
  );

  return <FileHoverPreviewContext.Provider value={value}>{children}</FileHoverPreviewContext.Provider>;
}

/** Header toggle + AttachmentHoverPortal — provider ke bina previews ON (click path jaisa). */
export function useFileHoverPreview(): FileHoverPreviewContextValue {
  const ctx = React.useContext(FileHoverPreviewContext);
  if (!ctx) {
    return {
      enabled: true,
      setEnabled: () => {},
      toggle: () => {},
    };
  }
  return ctx;
}
