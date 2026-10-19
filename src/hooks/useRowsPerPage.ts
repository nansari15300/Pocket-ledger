"use client";

import { useState, useCallback, useEffect } from "react";

const STORAGE_KEY = "app-rows-per-page";
const DEFAULT = 20;
const MIN = 10;
const MAX = 100;

function getStored(overrideDefault?: number, storageKey: string = STORAGE_KEY): number {
  if (typeof window === "undefined") return overrideDefault ?? DEFAULT;
  try {
    const v = localStorage.getItem(storageKey);
    if (v == null) return overrideDefault ?? DEFAULT;
    const n = parseInt(v, 10);
    if (!Number.isFinite(n) || n < MIN || n > MAX) return overrideDefault ?? DEFAULT;
    return n;
  } catch {
    return overrideDefault ?? DEFAULT;
  }
}

function setStored(value: number, storageKey: string = STORAGE_KEY) {
  if (typeof window === "undefined") return;
  try {
    const n = Math.min(MAX, Math.max(MIN, Math.floor(value)));
    localStorage.setItem(storageKey, String(n));
  } catch {}
}

/**
 * Shared rows-per-page for list pages (party, bank, staff, etc.).
 * Persisted in localStorage so the value survives refresh.
 */
export function useRowsPerPage(
  defaultOverride?: number,
  storageKey: string = STORAGE_KEY
): [number, (value: number) => void] {
  const fallback =
    defaultOverride != null && Number.isFinite(defaultOverride)
      ? Math.max(MIN, Math.min(MAX, defaultOverride))
      : DEFAULT;
  const [rowsPerPage, setState] = useState(() => getStored(fallback, storageKey));

  const setRowsPerPage = useCallback(
    (value: number) => {
      const parsed = Number(value);
      // Keep `All` (0) ephemeral for current view only; don't persist 0 globally.
      if (parsed === 0) {
        setState(0);
        return;
      }
      const n = Math.min(MAX, Math.max(MIN, Math.floor(parsed || DEFAULT)));
      setState(n);
      setStored(n, storageKey);
    },
    [storageKey]
  );

  return [rowsPerPage, setRowsPerPage];
}
