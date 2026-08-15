"use client";

import { useEffect, useState } from "react";
import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";
import { isElectronDesktopApp } from "@/lib/isElectronDesktop";
import { ANDROID_APP_VERSION, DESKTOP_APP_VERSION } from "@/config/releaseVersion";

type ReleaseItem = {
  version?: string;
  url?: string;
  playStoreUrl?: string;
};

type ReleaseManifest = {
  date?: string;
  windows?: ReleaseItem | null;
  android?: ReleaseItem | null;
};

const DAILY_CHECK_KEY = "pl-release-update-check-v1";
const RELEASE_BUCKET = "studio-5452513410-a3f5b.firebasestorage.app";
const RELEASE_PREFIX = "public-releases/latest.json";

function compareVersions(a: string, b: string): number {
  const left = String(a || "0").split(/[.-]/).map((part) => Number(part) || 0);
  const right = String(b || "0").split(/[.-]/).map((part) => Number(part) || 0);
  const size = Math.max(left.length, right.length);
  for (let i = 0; i < size; i += 1) {
    const delta = (left[i] ?? 0) - (right[i] ?? 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function latestReleaseUrl(): string {
  return `https://firebasestorage.googleapis.com/v0/b/${RELEASE_BUCKET}/o/${encodeURIComponent(
    RELEASE_PREFIX
  )}?alt=media`;
}

/**
 * EXE/APK only: at most one Firebase release check each calendar day.
 * Existing signed server-plan / offline-license sync remains the license authority.
 */
export function ReleaseUpdateCheck() {
  const [update, setUpdate] = useState<{ version: string; url: string; kind: "desktop" | "android" } | null>(
    null
  );

  useEffect(() => {
    const desktop = isElectronDesktopApp();
    const android = isCapacitorNativeApp();
    if (!desktop && !android) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;

    try {
      if (window.localStorage.getItem(DAILY_CHECK_KEY) === todayKey()) return;
      window.localStorage.setItem(DAILY_CHECK_KEY, todayKey());
    } catch {
      // Storage can be unavailable; a check is still safe.
    }

    let cancelled = false;
    void fetch(latestReleaseUrl(), { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Release check failed: ${response.status}`);
        return (await response.json()) as ReleaseManifest;
      })
      .then((manifest) => {
        if (cancelled) return;
        const item = desktop ? manifest.windows : manifest.android;
        const installed = desktop ? DESKTOP_APP_VERSION : ANDROID_APP_VERSION;
        const targetUrl = desktop ? item?.url : item?.playStoreUrl || item?.url;
        const available = String(item?.version || "").trim();
        if (!available || !targetUrl || compareVersions(available, installed) <= 0) return;
        setUpdate({
          version: available,
          url: targetUrl,
          kind: desktop ? "desktop" : "android",
        });
      })
      .catch(() => {
        // Update checks must never block an offline/local app.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!update) return null;
  return (
    <div className="fixed bottom-4 left-4 right-4 z-[200] mx-auto flex max-w-xl flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-300 bg-white px-4 py-3 text-sm shadow-xl dark:border-sky-600 dark:bg-slate-950">
      <span className="font-medium text-slate-900 dark:text-slate-100">
        Pocket Ledger {update.version} is available.
      </span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="text-slate-500 underline underline-offset-2"
          onClick={() => setUpdate(null)}
        >
          Later
        </button>
        <button
          type="button"
          className="rounded-full bg-sky-600 px-3 py-1.5 font-semibold text-white hover:bg-sky-700"
          onClick={() => window.location.assign(update.url)}
        >
          {update.kind === "android" ? "Update Android" : "Download update"}
        </button>
      </div>
    </div>
  );
}
