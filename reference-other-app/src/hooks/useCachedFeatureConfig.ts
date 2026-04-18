"use client";

import { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { firestore } from "@/lib/firebase";

const FEATURE_CONFIG_STORAGE_KEY = "app_settings:features";

function readCachedFeatureConfig(): Record<string, boolean> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(FEATURE_CONFIG_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : null;
  } catch {
    return null;
  }
}

function writeCachedFeatureConfig(value: Record<string, boolean>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FEATURE_CONFIG_STORAGE_KEY, JSON.stringify(value));
  } catch {}
}

export function useCachedFeatureConfig(defaultConfig: Record<string, boolean> = {}) {
  const [featureConfig, setFeatureConfig] = useState<Record<string, boolean>>(() => readCachedFeatureConfig() ?? defaultConfig);
  const [loading, setLoading] = useState(() => readCachedFeatureConfig() == null);

  // Stabilize inline defaults like useCachedFeatureConfig({}) so the Firestore subscription effect does not loop.
  const defaultConfigKey = useMemo(() => JSON.stringify(defaultConfig), [defaultConfig]);
  const fallbackConfig = useMemo(() => defaultConfig, [defaultConfigKey]);

  useEffect(() => {
    const cached = readCachedFeatureConfig();
    if (cached) {
      // Restore the last known feature config immediately so sidebar/pages remain usable after offline refresh.
      setFeatureConfig(cached);
      setLoading(false);
    }

    const unsub = onSnapshot(doc(firestore, "app_settings", "features"), (docSnap) => {
      const nextConfig = docSnap.exists() ? (docSnap.data() as Record<string, boolean>) : fallbackConfig;
      setFeatureConfig(nextConfig);
      writeCachedFeatureConfig(nextConfig);
      setLoading(false);
    }, () => {
      // If Firestore is unavailable, keep serving the cached config instead of clearing the UI.
      setLoading(false);
    });

    return () => unsub();
  }, [fallbackConfig]);

  return { featureConfig, loading };
}
