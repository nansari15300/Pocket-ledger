"use client";

import * as React from "react";

/** localStorage key — purana rakha; values: `off` | `hover` | `click` (legacy `0`/`1` migrate) */
const STORAGE_KEY = "pocket-ledger-file-hover-preview-v1";

/** Global file/avatar preview: band / hover / click */
export type FilePreviewMode = "off" | "hover" | "click";

type FileHoverPreviewContextValue = {
  mode: FilePreviewMode;
  setMode: (next: FilePreviewMode) => void;
  /** @deprecated — `mode !== "off"`; purane imports ke liye */
  enabled: boolean;
  /** @deprecated — `setMode` cycle: off → hover → click → off */
  setEnabled: (next: boolean) => void;
  /** @deprecated — mode cycle */
  toggle: () => void;
};

const FileHoverPreviewContext = React.createContext<FileHoverPreviewContextValue | null>(null);

const MODE_CYCLE: FilePreviewMode[] = ["off", "hover", "click"];

function parseStoredMode(raw: string | null): FilePreviewMode {
  if (raw === "off" || raw === "0" || raw === "false") return "off";
  if (raw === "hover" || raw === "2") return "hover";
  if (raw === "click" || raw === "1" || raw === "true") return "click";
  return "click";
}

function persistMode(next: FilePreviewMode) {
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* ignore */
  }
}

export function FileHoverPreviewProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = React.useState<FilePreviewMode>("click");

  React.useEffect(() => {
    try {
      setModeState(parseStoredMode(localStorage.getItem(STORAGE_KEY)));
    } catch {
      /* ignore */
    }
  }, []);

  const setMode = React.useCallback((next: FilePreviewMode) => {
    setModeState(next);
    persistMode(next);
  }, []);

  const setEnabled = React.useCallback(
    (next: boolean) => {
      setMode(next ? "click" : "off");
    },
    [setMode]
  );

  const toggle = React.useCallback(() => {
    setModeState((prev) => {
      const idx = MODE_CYCLE.indexOf(prev);
      const next = MODE_CYCLE[(idx + 1) % MODE_CYCLE.length]!;
      persistMode(next);
      return next;
    });
  }, []);

  const value = React.useMemo(
    () => ({
      mode,
      setMode,
      enabled: mode !== "off",
      setEnabled,
      toggle,
    }),
    [mode, setMode, setEnabled, toggle]
  );

  return <FileHoverPreviewContext.Provider value={value}>{children}</FileHoverPreviewContext.Provider>;
}

/** Header switch + AttachmentHoverPortal — provider ke bina default click (pehle `enabled: true` jaisa). */
export function useFileHoverPreview(): FileHoverPreviewContextValue {
  const ctx = React.useContext(FileHoverPreviewContext);
  if (!ctx) {
    return {
      mode: "click",
      setMode: () => {},
      enabled: true,
      setEnabled: () => {},
      toggle: () => {},
    };
  }
  return ctx;
}
