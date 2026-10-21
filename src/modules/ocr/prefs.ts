"use client";
/** Device-local OCR toggles (Add Voucher header). */
import { useSyncExternalStore } from "react";

export type OcrPrefs = { enabled: boolean; autoPost: boolean; overwriteEdited: boolean };
const KEY = "pl.ocr.prefs.v1";
const DEFAULTS: OcrPrefs = { enabled: true, autoPost: false, overwriteEdited: false };
const subs = new Set<() => void>();
let cache: OcrPrefs | null = null;

function load(): OcrPrefs {
  if (cache) return cache;
  try {
    cache = { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) || "{}") as Partial<OcrPrefs>) };
  } catch {
    cache = { ...DEFAULTS };
  }
  return cache;
}

export function getOcrPrefs(): OcrPrefs {
  return typeof window === "undefined" ? DEFAULTS : load();
}

export function setOcrPrefs(patch: Partial<OcrPrefs>) {
  cache = { ...load(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* ignore */
  }
  subs.forEach((f) => f());
}

export function useOcrPrefs(): OcrPrefs {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    getOcrPrefs,
    () => DEFAULTS
  );
}
