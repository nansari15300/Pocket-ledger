"use client";

import { useState, useCallback, useEffect } from "react";

const STORAGE_KEY = "app-rows-per-page";
const DEFAULT = 20;
const MIN = 10;
const MAX = 100;

function getStored(overrideDefault?: number): number {
  if (typeof window === "undefined") return overrideDefault ?? DEFAULT;
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v == null) return overrideDefault ?? DEFAULT;
    const n = parseInt(v, 10);
    if (!Number.isFinite(n) || n < MIN || n > MAX) return overrideDefault ?? DEFAULT;
    return n;
  } catch {
    return overrideDefault ?? DEFAULT;
  }
}

function setStored(value: number) {
  if (typeof window === "undefined") return;
  try {
    const n = Math.min(MAX, Math.max(MIN, Math.floor(value)));
    localStorage.setItem(STORAGE_KEY, String(n));
  } catch {}
}

/**
 * Shared rows-per-page for all list pages (party, bank, staff, etc.).
 * Persisted in localStorage so the same value is used everywhere and survives refresh.
 */
export function useRowsPerPage(defaultOverride?: number): [number, (value: number) => void] {
  const fallback =
    defaultOverride != null && Number.isFinite(defaultOverride)
      ? Math.max(MIN, Math.min(MAX, defaultOverride))
      : DEFAULT;
  const [rowsPerPage, setState] = useState(() => getStored(fallback));

  const setRowsPerPage = useCallback((value: number) => {
    const parsed = Number(value);
    // Keep `All` (0) ephemeral for current view only; don't persist 0 globally.
    if (parsed === 0) {
      setState(0);
      return;
    }
    const n = Math.min(MAX, Math.max(MIN, Math.floor(parsed || DEFAULT)));
    setState(n);
    setStored(n);
  }, []);

  return [rowsPerPage, setRowsPerPage];
}
